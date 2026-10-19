/* Exhaustive AI-correctness tests over EVERY reachable Tic-Tac-Toe position.
 *
 * The AI always plays O and always moves second in this game, so we enumerate
 * every distinct, non-terminal position in which it is O's turn, then assert:
 *   1. minimaxMove (hard) returns an EMPTY cell — never an occupied one
 *   2. that move achieves the game-theoretic optimal value, verified against
 *      an independent plain minimax reference (no pruning, memoized)
 *   3. mediumMove returns an empty cell, takes every available immediate win,
 *      and blocks every blockable immediate opponent threat
 *   4. randomOrBluff (easy) returns an empty cell
 * Since the reference proves O can always draw after any opening, check 2
 * implies the hard AI is unbeatable over the entire game tree.
 * Runs with: node tests/ai.test.js
 */
const { loadGame } = require("./harness");
const { T } = loadGame();

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
}
const isLegal = (b, i) => Number.isInteger(i) && i >= 0 && i < 9 && b[i] === "";

/* ---------- independent reference implementation (no pruning) ---------- */
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function refWinner(b) {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[c] === b[d]) return b[a];
  return b.every((v) => v) ? "draw" : null;
}
const memo = new Map();
function refBest(b, turn) {            // value from O's perspective: +1 O win, -1 X win, 0 draw
  const key = b.join("|") + turn;      // "|" separator: join("") would make empties invisible
  if (memo.has(key)) return memo.get(key);
  const w = refWinner(b);
  let v;
  if (w === "O") v = 1;
  else if (w === "X") v = -1;
  else if (w === "draw") v = 0;
  else {
    let best = turn === "O" ? -2 : 2;
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = turn;
      const sub = refBest(b, turn === "X" ? "O" : "X");
      b[i] = "";
      best = turn === "O" ? Math.max(best, sub) : Math.min(best, sub);
    }
    v = best;
  }
  memo.set(key, v);
  return v;
}

/* ---------- enumerate every reachable non-terminal position with O to move ---------- */
const seen = new Set();
const positions = [];
(function dfs(b, turn) {
  if (refWinner(b)) return;
  if (turn === "O") {
    const k = b.join("|");
    if (!seen.has(k)) { seen.add(k); positions.push(b.slice()); }
  }
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    dfs(b, turn === "X" ? "O" : "X");
    b[i] = "";
  }
})(Array(9).fill(""), "X");

console.log(`enumerated ${positions.length} distinct positions with O (AI) to move`);

/* ---------- reference sanity: perfect O draws after any opening X ---------- */
let sane = true;
for (let i = 0; i < 9; i++) {
  const q = Array(9).fill("");
  q[i] = "X";
  if (refBest(q, "O") !== 0) sane = false;
}
check("reference sanity: perfect O can draw after any opening X", sane);

/* ---------- exhaustive property checks ---------- */
let badLegal = 0, badOptimal = 0, badMediumLegal = 0, badMediumWin = 0, badMediumBlock = 0, badEasy = 0;
for (const p of positions) {
  /* hard AI: legality + optimality of the chosen move */
  const mv = T.minimaxMove(p.slice());
  if (!isLegal(p, mv)) { badLegal++; continue; }
  const after = p.slice();
  after[mv] = "O";
  if (refBest(after, "X") !== refBest(p, "O")) badOptimal++;

  /* medium AI: legality + takes wins + blocks threats */
  const mm = T.mediumMove(p.slice());
  if (!isLegal(p, mm)) { badMediumLegal++; continue; }
  const mAfter = p.slice();
  mAfter[mm] = "O";
  const oWinCells = [], xThreatCells = [];
  for (let i = 0; i < 9; i++) {
    if (p[i]) continue;
    const qO = p.slice(); qO[i] = "O";
    if (refWinner(qO) === "O") oWinCells.push(i);
    const qX = p.slice(); qX[i] = "X";
    if (refWinner(qX) === "X") xThreatCells.push(i);
  }
  if (oWinCells.length > 0 && refWinner(mAfter) !== "O") badMediumWin++;
  else if (oWinCells.length === 0 && xThreatCells.length > 0 && !xThreatCells.includes(mm)) badMediumBlock++;

  /* easy AI: legality */
  if (!isLegal(p, T.randomOrBluff(p.slice()))) badEasy++;
}
check("minimaxMove returns an empty cell for every position", badLegal === 0, `${badLegal} illegal`);
check("minimaxMove always achieves the game-theoretic optimal value", badOptimal === 0, `${badOptimal} suboptimal`);
check("mediumMove returns an empty cell for every position", badMediumLegal === 0, `${badMediumLegal} illegal`);
check("mediumMove takes every available immediate win", badMediumWin === 0, `${badMediumWin} missed wins`);
check("mediumMove blocks every blockable immediate threat", badMediumBlock === 0, `${badMediumBlock} missed blocks`);
check("easy (randomOrBluff) returns an empty cell for every position", badEasy === 0, `${badEasy} illegal`);

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail === 0 ? 0 : 1);
