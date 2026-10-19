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

  // returns index of a winning move (an empty cell that completes a line) or undefined
  function winningMove(mark) {
    for (const line of LINES) {
      const [a, b, c] = line;
      if (board[a] === mark && board[b] === mark) return c;
      if (board[b] === mark && board[c] === mark) return a;
      if (board[a] === mark && board[c] === mark) return b;
    }
    return undefined;
  }

  function corners() { return [0, 2, 6, 8].filter((i) => !board[i]); }

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
      setTimeout(playAiMove, 350);
    } else {
      setStatus(current === HUMAN ? "Your turn" : "AI's turn");
    }
  }

  // AI responds after the human moved.
  function playAiMove() {
    const move = aiBestMove(board);
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
  function minimax(bd, maximizing, alpha, beta) {
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
        best = maximizing ? Math.max(best, s) : Math.min(best, s);
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
      winningMove("O"),       // try to win now
      winningMove("X"),       // block opponent's win
      ...corners(bd),         // corner cells if empty
      4,                      // center if empty
      ...openCells(bd)        // any remaining open cell
    ];
    for (const i of order.filter(Boolean)) {
      if (!bd[i]) return i;
    }
    return undefined;
  }

  function openCells(bd) { return bd.map((v, i) => (v === "" ? i : -1)).filter((i) => i !== -1); }

  // easy: usually random but sometimes grabs a winning or blocking move
  function randomOrBluff(bd) {
    if (Math.random() < 0.4) {
      const win = winningMove("O");
      if (win !== undefined && !bd[win]) return win;
      const block = winningMove("X");
      if (block !== undefined && !bd[block]) return block;
    }
    return openCells(bd)[Math.floor(Math.random() * openCells(bd).length)] ?? 4;
  }

  /* ---------- controls ---------- */
  cells.forEach((cell) => cell.addEventListener("click", () => {
    const idx = Number(cell.dataset.index);
    handleMove(idx);
  }));

  modeSel.addEventListener("change", restart);

  restartBtn.addEventListener("click", restart);

  function restart() {
    board = Array(9).fill("");
    current = HUMAN;
    running = true;
    scores = { X: 0, O: 0, draw: 0 };
    render();
    updateScores();
    setStatus(`Player ${HUMAN}'s turn`);
    cells.forEach((c) => (c.disabled = false));
  }

  // start fresh on load
  restart();
})();
