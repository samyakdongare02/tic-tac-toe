(function () {
  "use strict";

  // The human player always uses X; any AI opponent uses O.
  const HUMAN = "X";

  // All winning combinations: 3 rows, 3 columns, 2 diagonals.
  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8],   // columns
    [0, 4, 8], [2, 4, 6]               // diagonals
  ];

  const statusEl = document.getElementById("status");
  const boardEl = document.getElementById("board");
  const cells = Array.from(document.querySelectorAll(".cell"));
  const modeSel = document.getElementById("mode");
  const restartBtn = document.getElementById("restart");
  const scoreX = document.getElementById("scoreX");
  const scoreO = document.getElementById("scoreO");
  const scoreDraw = document.getElementById("scoreDraw");

  let board = Array(9).fill("");     // "", "X", "O"
  let current = HUMAN;               // whose mark is next (human= X, ai= O)
  let running = true;                // game still in progress
  let scores = { X: 0, O: 0, draw: 0 };
  let aiTimer = null;                // pending AI move (cancelled on restart)

  /* ---------- helpers ---------- */
  function setStatus(msg) { statusEl.textContent = msg; }

  // returns the winning line array, or null if nobody has won yet
  function winLine() {
    for (const line of LINES) {
      const [a, b, c] = line;
      if (board[a] && board[b] === board[a] && board[c] === board[a]) return line;
    }
    return null;
  }

  // returns index of a winning move (an EMPTY cell that completes a line) or undefined
  function winningMove(bd, mark) {
    for (const line of LINES) {
      const [a, b, c] = line;
      if (bd[a] === mark && bd[b] === mark && bd[c] === "") return c;
      if (bd[b] === mark && bd[c] === mark && bd[a] === "") return a;
      if (bd[a] === mark && bd[c] === mark && bd[b] === "") return b;
    }
    return undefined;
  }

  function corners(bd) { return [0, 2, 6, 8].filter((i) => !bd[i]); }

  /* ---------- rendering ---------- */
  function render() {
    cells.forEach((cell, i) => {
      cell.textContent = board[i];
      cell.classList.toggle("x", board[i] === "X");
      cell.classList.toggle("o", board[i] === "O");
      cell.disabled = !board[i];
    });
  }

  function highlightWin(line) {
    cells.forEach((cell, i) => cell.classList.toggle("win", line.includes(i)));
  }

  function disableAll() { cells.forEach((c) => (c.disabled = true)); }

  function updateScores() {
    scoreX.textContent = scores.X;
    scoreO.textContent = scores.O;
    scoreDraw.textContent = scores.draw;
  }

  /* ---------- game flow ---------- */
  // Human places their mark. No-op if the board is full or game over.
  function handleMove(index) {
    if (!running || board[index]) return;
    placeMark(index, current);
    afterMove();
  }

  function afterMove() {
    const line = winLine();
    if (line) {
      running = false;
      highlightWin(line);
      const mark = board[line[0]];
      scores[mark]++;
      updateScores();
      setStatus(`${mark} wins! 🎉`);
      disableAll();
      return;
    }

    if (board.every((v) => v !== "")) {
      running = false;
      scores.draw++;
      updateScores();
      setStatus("It's a tie!");
      disableAll();
      return;
    }

    // game continues: switch turn, refresh the board
    current = current === HUMAN ? "O" : HUMAN;
    render();

    const aiTurn = modeSel.value !== "pvp" && current === "O";
    if (aiTurn) {
      setStatus("AI is thinking…");
      disableAll();
      clearTimeout(aiTimer);
      aiTimer = setTimeout(playAiMove, 350);
    } else {
      setStatus(current === HUMAN ? "Your turn" : "AI's turn");
    }
  }

  // AI responds after the human moved.
  function playAiMove() {
    aiTimer = null;
    if (!running) return;                          // game over / restarted
    const move = aiBestMove(board);
    if (!Number.isInteger(move) || board[move]) return;  // safety: valid empty cell
    placeMark(move, "O");
    afterMove();
  }

  function placeMark(index, mark) {
    board[index] = mark;
    cells[index].textContent = mark;
    cells[index].classList.add(mark.toLowerCase());
  }

  /* ---------- AI logic ---------- */
  // Hard mode: minimax — this version is unbeatable.
  function aiBestMove(bd) {
    const difficulty = modeSel.value;
    if (difficulty === "ai-easy") return randomOrBluff(bd);
    if (difficulty === "ai-medium") return mediumMove(bd);
    return minimaxMove(bd);
  }

  function minimaxMove(bd) {
    let bestScore = -Infinity;
    let bestIdx = undefined;
    for (let i = 0; i < 9; i++) {
      if (!bd[i]) {
        bd[i] = "O";
        const s = minimax(bd, false);
        bd[i] = "";
        if (s > bestScore) { bestScore = s; bestIdx = i; }
      }
    }
    return bestIdx ?? 4;
  }

  // Recursive minimax: `maximizing` is true when it's O's turn (higher = better),
  // false when it's X's turn. Alpha-beta pruning keeps the tree fast.
  function minimax(bd, maximizing, alpha = -Infinity, beta = Infinity) {
    const w = winFor(bd);
    if (w === "O") return 10 - depthOf(bd);
    if (w === "X") return depthOf(bd) - 10;
    if (bd.every((v) => v !== "")) return 0;

    let best = maximizing ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
      if (!bd[i]) {
        bd[i] = maximizing ? "O" : "X";
        const s = minimax(bd, !maximizing, alpha, beta);
        bd[i] = "";
        if (maximizing) {
          best = Math.max(best, s);
          alpha = Math.max(alpha, best);   // best score O is guaranteed so far
        } else {
          best = Math.min(best, s);
          beta = Math.min(beta, best);     // best score X is guaranteed so far
        }
        if (beta <= alpha) break;          // remaining branches can't change `best`
      }
    }
    return best;
  }

  function depthOf(bd) { return bd.filter((v) => v).length; }

  // returns the winner ("X", "O") or null
  function winFor(bd) {
    for (const line of LINES) {
      const [a, b, c] = line;
      if (bd[a] && bd[a] === bd[b] && bd[b] === bd[c]) return bd[a];
    }
    return null;
  }

  // medium: attack → defend → center → corner(s) → random open cell
  function mediumMove(bd) {
    const order = [
      winningMove(bd, "O"),   // try to win now
      winningMove(bd, "X"),   // block opponent's win
      4,                      // center if empty (strongest: in 4 lines)
      ...corners(bd),         // corner cells if empty (in 3 lines)
      ...openCells(bd)        // any remaining open cell
    ];
    // NOTE: filter(Boolean) would wrongly drop index 0 (falsy) — keep only undefined.
    for (const i of order.filter((i) => i !== undefined)) {
      if (!bd[i]) return i;
    }
    return undefined;
  }

  function openCells(bd) { return bd.map((v, i) => (v === "" ? i : -1)).filter((i) => i !== -1); }

  // easy: usually random but sometimes grabs a winning or blocking move
  function randomOrBluff(bd) {
    if (Math.random() < 0.4) {
      const win = winningMove(bd, "O");
      if (win !== undefined && !bd[win]) return win;
      const block = winningMove(bd, "X");
      if (block !== undefined && !bd[block]) return block;
    }
    return openCells(bd)[Math.floor(Math.random() * openCells(bd).length)] ?? 4;
  }

  /* ---------- controls ---------- */
  cells.forEach((cell) => cell.addEventListener("click", () => {
    const idx = Number(cell.dataset.index);
    handleMove(idx);
  }));

  modeSel.addEventListener("change", resetAll);   // switching matchup → fresh board + score

  restartBtn.addEventListener("click", newGame);  // New Game → new board, score kept

  // Start a new round: resets the board but KEEPS the running score.
  function newGame() {
    clearTimeout(aiTimer);
    aiTimer = null;
    board = Array(9).fill("");
    current = HUMAN;
    running = true;
    render();
    updateScores();
    setStatus(`Player ${HUMAN}'s turn`);
    cells.forEach((c) => (c.disabled = false));
  }

  // Full reset (page load / mode change): board + scoreboard to zero.
  function resetAll() {
    scores = { X: 0, O: 0, draw: 0 };
    newGame();
  }

  // start fresh on load
  resetAll();
})();
