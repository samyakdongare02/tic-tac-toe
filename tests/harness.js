/* Shared test harness: a mock DOM that enforces real browser semantics —
 * clicks on a disabled button are swallowed — plus a loader that runs the
 * REAL script.js inside a Node vm with a __T test hook spliced into the IIFE.
 * Used by tests/tictac.test.js and tests/ai.test.js.
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/* ---------- mock DOM (textContent coerces to string, like a real DOM) ---------- */
function makeClassList(el) {
  return {
    add: (...n) => n.forEach((x) => el._c.add(x)),
    remove: (...n) => n.forEach((x) => el._c.delete(x)),
    toggle: (name, force) => {
      const has = el._c.has(name);
      const on = force === undefined ? !has : !!force;
      if (on) el._c.add(name); else el._c.delete(name);
      return on;
    },
    contains: (n) => el._c.has(n),
  };
}
function makeEl(extra = {}) {
  const el = Object.assign({ _c: new Set(), _l: {}, disabled: false, value: "", dataset: {} }, extra);
  let text = "";
  Object.defineProperty(el, "textContent", { get: () => text, set: (v) => { text = String(v); } });
  el.classList = makeClassList(el);
  el.addEventListener = (t, fn) => { (el._l[t] ||= []).push(fn); };
  /* a real browser ignores clicks on disabled buttons */
  el.fire = (t) => {
    if (t === "click" && el.disabled) return;
    (el._l[t] || []).forEach((f) => f());
  };
  return el;
}

function loadGame() {
  const cells = Array.from({ length: 9 }, (_, i) => makeEl({ dataset: { index: String(i) } }));
  const els = {
    status: makeEl(), board: makeEl(), mode: makeEl({ value: "pvp" }),
    restart: makeEl(), scoreX: makeEl(), scoreO: makeEl(), scoreDraw: makeEl(),
  };
  const document = {
    getElementById: (id) => els[id],
    querySelectorAll: (sel) => (sel === ".cell" ? cells : []),
  };

  let code = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
  const hook = `globalThis.__T = {
  mediumMove, randomOrBluff, minimaxMove, winFor, winningMove,
  setBoard: (b) => { board = b.slice(); },
  getBoard: () => board.slice(),
};`;
  code = code.replace(/\}\)\(\);\s*$/, hook + "\n})();");

  const ctx = { document, setTimeout, clearTimeout, console };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  if (!ctx.__T) throw new Error("test hook missing — script.js structure changed");
  return { T: ctx.__T, els, cells, document, bd: (s) => s.split("").map((c) => (c === "." ? "" : c)) };
}

module.exports = { loadGame };
