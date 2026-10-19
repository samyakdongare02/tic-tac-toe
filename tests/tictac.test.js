/* Game-logic regression tests: loads the REAL script.js through the shared
 * harness (tests/harness.js), whose mock DOM ENFORCES real-browser button
 * semantics — clicks on a disabled cell are swallowed (this is exactly how
 * the "cells frozen after the AI move" bug once escaped testing).
 * Runs with: node tests/tictac.test.js
 */
const { loadGame, makeStorage } = require("./harness");
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

  console.log("\n=== TEST 7 (Fix 1): win highlight removed on New Game and mode change ===");
  els.mode.value = "pvp"; els.mode.fire("change");
  click(0); click(3); click(1); click(4); click(2);   // X wins top row
  let winCells = cells.filter((c) => c.classList.contains("win")).length;
  check("winning cells highlighted (.win) during the win", winCells === 3, `${winCells} highlighted`);
  els.restart.fire("click");
  winCells = cells.filter((c) => c.classList.contains("win")).length;
  check("no .win remains after New Game", winCells === 0, `${winCells} highlighted`);
  click(0); click(3); click(1); click(4); click(2);   // X wins again
  els.mode.value = "ai-hard"; els.mode.fire("change");
  winCells = cells.filter((c) => c.classList.contains("win")).length;
  check("no .win remains after mode change", winCells === 0, `${winCells} highlighted`);

  console.log("\n=== TEST 8 (Fix 3): scoreboard survives an app relaunch ===");
  const SCORES_KEY = "tictactoe.scores.v1";
  const shared = makeStorage();
  const g1 = loadGame({ storage: shared });            // first "app run"
  g1.els.mode.value = "pvp"; g1.els.mode.fire("change");
  g1.cells[0].fire("click"); g1.cells[3].fire("click"); g1.cells[1].fire("click");
  g1.cells[4].fire("click"); g1.cells[2].fire("click"); // X wins
  let saved = shared.getItem(SCORES_KEY);
  check("scores written to localStorage on win", saved !== null && typeof saved === "string" && JSON.parse(saved).X === 1, `${saved}`);
  const g2 = loadGame({ storage: shared });            // second "app run" (relaunch)
  check("relaunch restores totals (X=1)", g2.els.scoreX.textContent === "1", `X=${g2.els.scoreX.textContent}`);
  check("relaunch restores totals (O=0, tie=0)", g2.els.scoreO.textContent === "0" && g2.els.scoreDraw.textContent === "0", `O=${g2.els.scoreO.textContent} tie=${g2.els.scoreDraw.textContent}`);

  console.log("\n=== TEST 8b (Fix 3): corrupt saved data starts fresh at 0,0,0 ===");
  const badStore = makeStorage();
  badStore.setItem(SCORES_KEY, "{corrupted json!");
  const g3 = loadGame({ storage: badStore });
  check("corrupt storage -> boots with 0,0,0",
    g3.els.scoreX.textContent === "0" && g3.els.scoreO.textContent === "0" && g3.els.scoreDraw.textContent === "0",
    `X=${g3.els.scoreX.textContent} O=${g3.els.scoreO.textContent} tie=${g3.els.scoreDraw.textContent}`);

  console.log("\n=== TEST 8c (Fix 3): throwing storage must not crash startup ===");
  const throwStore = makeStorage();
  throwStore.failing = true;
  const g4 = loadGame({ storage: throwStore });
  check("throwing storage -> boots with 0,0,0",
    g4.els.scoreX.textContent === "0" && g4.els.scoreO.textContent === "0" && g4.els.scoreDraw.textContent === "0",
    `X=${g4.els.scoreX.textContent} O=${g4.els.scoreO.textContent} tie=${g4.els.scoreDraw.textContent}`);

  console.log("\n=== TEST 8d (Fix 3): mode change still zeroes and re-persists ===");
  g2.els.mode.value = "ai-hard"; g2.els.mode.fire("change");
  check("mode change zeroes the scoreboard", g2.els.scoreX.textContent === "0", `X=${g2.els.scoreX.textContent}`);
  const afterModeChange = JSON.parse(shared.getItem(SCORES_KEY));
  check("mode change re-persists zeros", afterModeChange.X === 0 && afterModeChange.O === 0 && afterModeChange.draw === 0, `${shared.getItem(SCORES_KEY)}`);

  console.log("\n=== TEST 9: rapid clicks during 'AI is thinking…' ===");
  els.mode.value = "ai-hard"; els.mode.fire("change");
  click(0); click(1); click(2);      // 1st lands; the other two hit disabled cells
  await sleep(500);                  // AI places O
  const m1 = marks();
  const xs = T.getBoard().filter((v) => v === "X").length;
  const os = T.getBoard().filter((v) => v === "O").length;
  check("no duplicate marks from swallowed rapid clicks", m1 === 2 && xs === 1 && os === 1, `marks=${m1} X=${xs} O=${os}`);
  const nextEmpty = T.getBoard().findIndex((v) => v === "");
  click(nextEmpty);                  // game continues after the burst
  await sleep(500);
  check("AI responds after the burst (game not stuck)", marks() === m1 + 2 && els.status.textContent === "Your turn", `marks=${marks()} status="${els.status.textContent}"`);

  console.log("\n=== TEST 10 (Fix 4 acceptance): classic trap — X has centre+corner, O took an edge ===");
  T.setBoard(bd("XO..X...."));       // X@4 centre, O@1 edge, X@0 corner; O to move
  const trap = T.minimaxMove(T.getBoard());
  check("hard AI blocks the diagonal at corner 8 (not an edge)", trap === 8, `got ${trap}`);

  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  process.exit(fail === 0 ? 0 : 1);
})();
