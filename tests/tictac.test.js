/* Game-logic regression tests: loads the REAL script.js through the shared
 * harness (tests/harness.js), whose mock DOM ENFORCES real-browser button
 * semantics — clicks on a disabled cell are swallowed (this is exactly how
 * the "cells frozen after the AI move" bug once escaped testing).
 * Runs with: node tests/tictac.test.js
 */
const { loadGame } = require("./harness");
const { T, els, cells, bd } = loadGame();

/* ---------- helpers ---------- */
const click = (i) => cells[i].fire("click");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const marks = () => T.getBoard().filter((v) => v).length;
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
}

(async () => {
  /* ===== the APK bug: after the AI's O, the player must still be able to move ===== */
  console.log("=== TEST 0: after AI's O, the player can still move ===");
  els.mode.value = "ai-hard"; els.mode.fire("change");
  click(4);                        // X center
  await sleep(500);                // AI places O
  const before = marks();
  const emptyIdx = T.getBoard().findIndex((v) => v === "");
  click(emptyIdx);                 // player's next move on a truly EMPTY cell
  await sleep(500);                // let AI respond
  console.log(`  clickable cells now: ${cells.filter((c) => !c.disabled).length}/9`);
  console.log(`  player tapped an empty cell: marks ${before} -> ${marks()}`);
  const anyEmptyPlayable = cells.some((c, i) => !c.disabled && !T.getBoard()[i]);
  check("at least one empty cell is clickable after the AI move", anyEmptyPlayable);
  check("player's move after AI move actually lands", marks() === before + 2, `${before} -> ${marks()}`);

  console.log("\n=== TEST 0b: after every render, occupied=disabled, empty=enabled ===");
  els.mode.value = "pvp"; els.mode.fire("change");
  let okSemantics = true;
  click(0);
  for (let i = 0; i < 9; i++) {
    const occ = T.getBoard()[i] !== "";
    if (cells[i].disabled !== occ) okSemantics = false;
  }
  check("disabled state matches occupancy (empty=enabled, filled=disabled)", okSemantics);

  /* ===== regression: medium-AI move bugs ===== */
  console.log("\n=== TEST 1: medium AI should WIN at cell 0 (O at 1,2) ===");
  els.mode.value = "ai-medium"; els.mode.fire("change");
  T.setBoard(bd(".OOXX...."));
  let mv = T.mediumMove(T.getBoard());
  check("medium takes the win at cell 0", mv === 0, `got ${mv}`);

  console.log("\n=== TEST 2: medium AI should BLOCK cell 0 (X at 1,2) ===");
  T.setBoard(bd(".XXO....."));
  mv = T.mediumMove(T.getBoard());
  check("medium blocks at cell 0", mv === 0, `got ${mv}`);

  console.log("\n=== TEST 2b: medium AI should WIN at 7, not block at 8 ===");
  T.setBoard(bd("XOXOOXX.."));
  mv = T.mediumMove(T.getBoard());
  check("medium takes the win at 7 (ignores occupied return)", mv === 7, `got ${mv}`);

  console.log("\n=== TEST 3: easy mode reaches cell 0 on an empty board ===");
  let saw0 = false;
  for (let k = 0; k < 300; k++) { T.setBoard(bd(".........")); if (T.randomOrBluff(T.getBoard()) === 0) { saw0 = true; break; } }
  check("easy mode can play cell 0", saw0);

  console.log("\n=== TEST 4: no ghost AI move after New Game (real gameplay) ===");
  els.mode.value = "ai-medium"; els.mode.fire("change");
  click(4);
  els.restart.fire("click");
  const gBefore = marks();
  await sleep(500);
  const gAfter = marks();
  check("no ghost AI move after New Game", gBefore === gAfter, `${gBefore} -> ${gAfter}`);

  console.log("\n=== TEST 4b: New Game re-enables every cell ===");
  els.restart.fire("click");
  check("all 9 cells clickable after New Game", cells.every((c) => !c.disabled));
  click(4); await sleep(500);
  els.restart.fire("click");
  check("New Game during AI thinking re-enables all cells", cells.every((c) => !c.disabled));

  console.log("\n=== TEST 5: scoreboard survives a New Game (real gameplay) ===");
  els.mode.value = "pvp"; els.mode.fire("change");
  click(0); click(3); click(1); click(4); click(2);   // X wins
  check("X win counted", els.scoreX.textContent === "1", `got ${els.scoreX.textContent}`);
  els.restart.fire("click");
  check("score preserved on New Game", els.scoreX.textContent === "1", `got ${els.scoreX.textContent}`);

  console.log("\n=== TEST 5b: PvP turn flow works end-to-end (both players can move) ===");
  els.mode.value = "pvp"; els.mode.fire("change");
  click(0); click(4); click(1); click(5); click(2);   // X wins across the top
  check("PvP: X wins and status reflects it", els.status.textContent.includes("X wins"), `status="${els.status.textContent}"`);

  console.log("\n=== TEST 6: hard (minimax) still unbeatable (real gameplay) ===");
  els.mode.value = "ai-hard"; els.mode.fire("change");
  let xWins = false;
  for (const m of [4, 0, 2, 6, 8]) {
    click(m); await sleep(420);
    if (els.status.textContent.includes("X wins")) xWins = true;
    if (/(wins|tie)/.test(els.status.textContent)) break;
  }
  check("hard AI never loses to this line", !xWins, `status="${els.status.textContent}"`);

  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  process.exit(fail === 0 ? 0 : 1);
})();
