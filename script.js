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

  /* ---------- DOM handles (V2 additions are optional and null-guarded:
   *            the test harness only mocks the V1 elements) ---------- */
  const statusEl = document.getElementById("status");
  const boardEl = document.getElementById("board");
  const cells = Array.from(document.querySelectorAll(".cell"));
  const modeSel = document.getElementById("mode");
  const restartBtn = document.getElementById("restart");
  const scoreX = document.getElementById("scoreX");
  const scoreO = document.getElementById("scoreO");
  const scoreDraw = document.getElementById("scoreDraw");
  const undoBtn = document.getElementById("undo");
  const soundBtn = document.getElementById("sound");
  const fogBtn = document.getElementById("fog");
  const strikeEl = document.getElementById("strike");
  const confettiEl = document.getElementById("confetti");
  const turnBoxX = document.getElementById("boxX");
  const turnBoxO = document.getElementById("boxO");

  let board = Array(9).fill("");     // "", "X", "O"
  let current = HUMAN;               // whose mark is next (human= X, ai= O)
  let running = true;                // game still in progress
  let moveStack = [];                // V2 undo: [{ i, mark }] in placement order
  let aiTimer = null;                // pending AI move (cancelled on restart)
  let staggerTimers = [];            // V2: pending New-Game visual timers
  const SCORES_KEY = "tictactoe.scores.v1";  // persisted scoreboard (Fix 3)
  let scores = { X: 0, O: 0, draw: 0 };
  let scoresRestored = false;        // false until loadScores() ran once (guards Fix 3)

  /* ---------- V2 settings (theme / sound / fog) ---------- */
  // Separate key from the scoreboard: corrupt settings must never touch scores.
  const SETTINGS_KEY = "tictactoe.settings.v1";
  const DEFAULT_SETTINGS = { theme: "neon", mute: false, fog: false };
  function storeGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === "object") ? parsed : fallback;
    } catch (_) { return fallback; }
  }
  function storeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (_) { /* storage unavailable: settings stay in memory */ }
  }
  let settings = Object.assign({}, DEFAULT_SETTINGS, storeGet(SETTINGS_KEY, {}));
  function saveSettings() { storeSet(SETTINGS_KEY, settings); }

  /* ---------- V2 feature-capability probes (all optional) ---------- */
  function raf(fn) {                  // requestAnimationFrame, when it exists
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(fn);
    else fn();
  }
  function reduceMotion() {
    try {
      return typeof window !== "undefined" &&
        window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) { return false; }
  }
  function haptic(pattern) {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
    } catch (_) { /* unsupported: silent */ }
  }
  function styleVar(el, name, value) {
    try { if (el && el.style && el.style.setProperty) el.style.setProperty(name, value); }
    catch (_) { /* mock elements have no style */ }
  }

  /* ================= V2: SFX — synthesized with WebAudio, zero assets ================= */
  const SFX = {
    ctx: null,
    unlock() {                        // browsers require a user gesture before audio
      try {
        if (!this.ctx) {
          const AC = (typeof window !== "undefined") && (window.AudioContext || window.webkitAudioContext);
          if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
      } catch (_) { this.ctx = null; }
    },
    tone(type, f0, f1, dur, vol, delay) {
      if (settings.mute || !this.ctx) return;
      try {
        const t = this.ctx.currentTime + (delay || 0);
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(f0, t);
        if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(this.ctx.destination);
        o.start(t); o.stop(t + dur + 0.02);
      } catch (_) {}
    },
    noise(dur, vol, f0, f1) {
      if (settings.mute || !this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const n = this.ctx.createBufferSource(), g = this.ctx.createGain(), bp = this.ctx.createBiquadFilter();
        const buf = this.ctx.createBuffer(1, Math.max(1, (this.ctx.sampleRate * dur) | 0), this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        n.buffer = buf; bp.type = "bandpass"; bp.Q = 1.4;
        bp.frequency.setValueAtTime(f0, t);
        if (f1) bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        n.connect(bp).connect(g).connect(this.ctx.destination);
        n.start(t);
      } catch (_) {}
    },
    tap(mark) {
      if (mark === "X") this.tone("square", 696, 588, 0.09, 0.1);
      else this.tone("sine", 494, 440, 0.16, 0.13);
    },
    win() {
      const N = [523, 659, 784];                       // C5 · E5 · G5 arpeggio
      for (let i = 0; i < 3; i++) this.tone("sine", N[i], 0, 0.2, 0.15, i * 0.11);
      this.noise(0.3, 0.09, 6000);                     // sparkle
    },
    tie() { this.tone("triangle", 90, 0, 0.08, 0.2); this.tone("triangle", 80, 0, 0.08, 0.2, 0.14); },
    undo() { this.noise(0.18, 0.12, 1000, 250); },
    ui() { this.tone("sine", 1046, 0, 0.05, 0.05); },
  };
  // first user gesture unlocks the audio context (mobile autoplay policy)
  if (document.addEventListener) {
    document.addEventListener("pointerdown", function () { SFX.unlock(); },
      { once: true, capture: true });
  }

  /* ---------- helpers ---------- */
  function setStatus(msg, thinking) {
    statusEl.textContent = msg;
    try { statusEl.classList.toggle("thinking", !!thinking); } catch (_) {}
  }

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

  /* ================= V2: FX — hand-drawn marker glyphs ================= */
  const X_PATHS = [   // three slightly different X strokes; one is picked at random
    ["M12 20 C40 46 58 62 86 84", "M84 18 C60 44 40 66 14 88"],
    ["M16 14 C38 40 62 64 84 86", "M86 14 C64 42 36 66 15 86"],
    ["M14 22 C44 42 60 60 88 80", "M82 20 C62 40 36 60 16 84"],
  ];
  const O_SHAPES = [[47, 48, 30], [51, 50, 32], [49, 52, 28]];   // cx, cy, r
  function removeGlyph(cell) {
    try {
      if (cell._glyph && cell._glyph.remove) { cell._glyph.remove(); cell._glyph = null; }
    } catch (_) {}
  }
  function drawGlyph(cell, mark, instant) {
    removeGlyph(cell);
    if (!mark || !document.createElementNS || !cell.appendChild) return;
    try {
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("class", "glyph" + (instant ? " instant" : ""));
      svg.setAttribute("aria-hidden", "true");
      if (mark === "X") {
        for (const d of X_PATHS[(Math.random() * X_PATHS.length) | 0]) {
          const p = document.createElementNS(NS, "path");
          p.setAttribute("d", d); p.setAttribute("pathLength", "1");
          p.setAttribute("class", "st"); svg.appendChild(p);
        }
      } else {
        const s = O_SHAPES[(Math.random() * O_SHAPES.length) | 0];
        const c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", s[0]); c.setAttribute("cy", s[1]); c.setAttribute("r", s[2]);
        c.setAttribute("pathLength", "1"); c.setAttribute("class", "st");
        svg.appendChild(c);
      }
      svg.style.transform = "rotate(" + (Math.random() * 8 - 4).toFixed(1) + "deg)";
      cell._glyph = svg;                     // fast removal handle (also works in mock DOM)
      cell.appendChild(svg);
      if (!instant && !reduceMotion()) {
        raf(() => raf(() => svg.classList.add("ready")));
      } else {
        svg.classList.add("ready", "instant");
      }
    } catch (_) { /* cosmetic only — never break game logic */ }
  }

  /* ================= V2: FX — marker strike-through of the winning line ================= */
  function buildWobble(x0, y0, x1, y1) {
    const pts = [], over = 0.18;
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    const ex0 = x0 - (dx / L) * over, ey0 = y0 - (dy / L) * over;   // overshoot both ends
    const ex1 = x1 + (dx / L) * over, ey1 = y1 + (dy / L) * over;
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const px = ex0 + (ex1 - ex0) * t, py = ey0 + (ey1 - ey0) * t;
      const j = (k === 0 || k === 6) ? 0 : Math.random() * 0.07 - 0.035;  // ± jitter
      pts.push((px + j).toFixed(3) + " " + (py + j).toFixed(3));
    }
    return "M" + pts.join(" L");
  }
  function strikeLine(line, mark) {
    if (!strikeEl || !document.createElementNS) return;
    try {
      const NS = "http://www.w3.org/2000/svg";
      const A = { x: (line[0] % 3) + 0.5, y: Math.floor(line[0] / 3) + 0.5 };
      const B = { x: (line[2] % 3) + 0.5, y: Math.floor(line[2] / 3) + 0.5 };
      strikeEl.innerHTML = "";
      strikeEl.classList.add("on");
      for (const cls of ["s1", "s2"]) {              // s1 = main stroke, s2 = pen overdraw
        const p = document.createElementNS(NS, "path");
        p.setAttribute("d", buildWobble(A.x, A.y, B.x, B.y));
        p.setAttribute("pathLength", "1");
        p.setAttribute("class", cls);
        p.setAttribute("stroke", mark === "X" ? "var(--x)" : "var(--o)");
        strikeEl.appendChild(p);
      }
      raf(() => raf(() => strikeEl.classList.add("ready")));
    } catch (_) {}
  }
  function clearStrike() {
    if (!strikeEl) return;
    strikeEl.classList.remove("on", "ready");
    strikeEl.innerHTML = "";
  }

  /* ================= V2: FX — winning X/O glyph confetti ================= */
  let confettiTimer = null;
  function confettiBurst(line) {
    if (reduceMotion() || !confettiEl || !confettiEl.getContext) return;
    try {
      const r = boardEl.getBoundingClientRect();
      const ctx2 = confettiEl.getContext("2d");
      confettiEl.width = r.width; confettiEl.height = r.height;
      const col = (c) => ({ x: ((c % 3) / 3 + 1 / 6) * r.width, y: (Math.floor(c / 3) / 3 + 1 / 6) * r.height });
      const a = col(line[0]), b = col(line[2]);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const css = (typeof window !== "undefined" && window.getComputedStyle)
        ? window.getComputedStyle(document.documentElement) : null;
      const cX = (css ? css.getPropertyValue("--x") : "") || "#38bdf8";
      const cO = (css ? css.getPropertyValue("--o") : "") || "#f472b6";
      const parts = [];
      for (let i = 0; i < 46; i++) {
        const ang = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 190;
        parts.push({
          x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 130,
          rot: Math.random() * 360, vr: Math.random() * 240 - 120,
          kind: Math.random() < 0.5 ? "X" : "O",
          col: i % 2 ? cX : cO, born: performance.now(),
        });
      }
      const end = performance.now() + 1100;
      cancelAnimationFrame(confettiTimer);
      (function loop() {
        if (performance.now() > end) {
          ctx2.clearRect(0, 0, confettiEl.width, confettiEl.height);
          return;
        }
        ctx2.clearRect(0, 0, confettiEl.width, confettiEl.height);
        const dt = 1 / 60;
        for (const p of parts) {
          const age = (performance.now() - p.born) / 1100;
          p.vy += 560 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
          ctx2.save(); ctx2.translate(p.x, p.y); ctx2.rotate((p.rot * Math.PI) / 180);
          ctx2.globalAlpha = Math.max(0, 1 - age);
          ctx2.strokeStyle = p.col; ctx2.lineWidth = 3;
          if (p.kind === "X") {
            ctx2.beginPath(); ctx2.moveTo(-6, -6); ctx2.lineTo(6, 6);
            ctx2.moveTo(6, -6); ctx2.lineTo(-6, 6); ctx2.stroke();
          } else { ctx2.beginPath(); ctx2.arc(0, 0, 5.5, 0, 7); ctx2.stroke(); }
          ctx2.restore();
        }
        confettiTimer = requestAnimationFrame(loop);
      })();
    } catch (_) { /* cosmetic only */ }
  }
  function confettiClear() {
    try { if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(confettiTimer); } catch (_) {}
    try { if (confettiEl && confettiEl.getContext) confettiEl.getContext("2d").clearRect(0, 0, confettiEl.width, confettiEl.height); }
    catch (_) {}
  }

  /* ---------- rendering ---------- */
  /* V1 render(): plain state sync — glyphs/colors/etc. are additive layers. */
  function render() {
    cells.forEach((cell, i) => {
      cell.textContent = board[i];
      cell.classList.toggle("x", board[i] === "X");
      cell.classList.toggle("o", board[i] === "O");
      cell.classList.remove("win");   // clear residual win highlight (New Game / mode change)
      cell.disabled = !!board[i];   // occupied cells are not clickable (was inverted!)
      if (cell.setAttribute) cell.setAttribute("aria-label", board[i] ? board[i] + " in cell " + (i + 1) : "Cell " + (i + 1));
    });
  }
  function highlightWin(line) {
    cells.forEach((cell, i) => cell.classList.toggle("win", line.includes(i)));
  }
  function updateTurnUI() {           // V2: the current player's box breathes
    try {
      if (turnBoxX) turnBoxX.classList.toggle("turn", running && current === "X");
      if (turnBoxO) turnBoxO.classList.toggle("turn", running && current === "O");
    } catch (_) {}
  }
  // V2 fog mode: a mark fades once 2 further marks were placed after it.
  function fogUpdate() {
    const ages = Array(9).fill(0);
    moveStack.forEach((e, n) => { ages[e.i] = moveStack.length - 1 - n; });
    cells.forEach((cell, i) => {
      if (board[i] && settings.fog && running) cell.classList.toggle("faded", ages[i] >= 2);
      else cell.classList.remove("faded");
    });
  }
  function disableAll() { cells.forEach((c) => (c.disabled = true)); }
  function setPlayable() {
    cells.forEach((c, i) => (c.disabled = !!board[i]));   // empty=enabled, filled=disabled
  }

  function updateScores() {
    scoreX.textContent = scores.X;
    scoreO.textContent = scores.O;
    scoreDraw.textContent = scores.draw;
    persistScores();
  }

  // Fix 3: keep the scoreboard across app restarts via localStorage.
  // Guarded access: storage can be unavailable or throw in some contexts.
  function persistScores() {
    if (!scoresRestored) return;     // the startup reset must not clobber saved totals
    try { localStorage.setItem(SCORES_KEY, JSON.stringify(scores)); }
    catch (_) { /* storage unavailable: scores stay in memory */ }
  }

  function loadScores() {
    scoresRestored = true;           // from here on, persisting is safe
    try {
      const raw = localStorage.getItem(SCORES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && ["X", "O", "draw"].every((k) => typeof parsed[k] === "number")) {
        scores = parsed;
      }
    } catch (_) { /* corrupted or unreadable: start fresh */ }
  }

  /* ---------- game flow ---------- */
  // Human or AI places their mark. No-op if the board is full or game over.
  function handleMove(index) {
    if (!running || board[index]) return;
    placeMark(index, current);
    afterMove();
  }

  // V2: the shared placement step — logic + additive FX in one place.
  function placeMark(index, mark) {
    board[index] = mark;
    moveStack.push({ i: index, mark: mark });
    cells[index].textContent = mark;                    // logic-visible (tests read this)
    cells[index].classList.add(mark.toLowerCase());
    if (cells[index].setAttribute) cells[index].setAttribute("aria-label", mark + " in cell " + (index + 1));
    drawGlyph(cells[index], mark, false);
    cells.forEach((c) => c.classList.remove("last"));
    cells[index].classList.add("last");                 // last-move corner dot
    SFX.tap(mark); haptic(12);
    fogUpdate();
    if (undoBtn) undoBtn.disabled = moveStack.length === 0;
  }
  function undoPlace() {                                // visual clean-up for Undo
    const e = moveStack.pop();
    board[e.i] = "";
    const c = cells[e.i];
    c.textContent = "";
    c.classList.remove(c.classList.contains("x") ? "x" : "o");
    styleVar(c, "--d", "0ms");
    removeGlyph(c);
    c.classList.remove("win", "last", "faded", "out", "enter");
    c.disabled = false;
    if (c.setAttribute) c.setAttribute("aria-label", "Cell " + (e.i + 1));
    return e;
  }

  function afterMove() {
    const line = winLine();
    if (line) {
      running = false;
      highlightWin(line);
      strikeLine(line, board[line[0]]);
      confettiBurst(line);
      const mark = board[line[0]];
      scores[mark]++;
      updateScores();
      setStatus(`${mark} wins! 🎉`);
      disableAll();
      updateTurnUI();
      SFX.win(); haptic([20, 30, 90]);
      if (undoBtn) undoBtn.disabled = false;            // undo still repairs a lost round
      return;
    }

    if (board.every((v) => v !== "")) {
      running = false;
      scores.draw++;
      updateScores();
      setStatus("It's a tie!");
      disableAll();
      updateTurnUI();
      SFX.tie(); haptic(15);
      if (undoBtn) undoBtn.disabled = false;
      return;
    }

    // game continues: switch turn, refresh the board
    current = current === HUMAN ? "O" : HUMAN;
    render();
    fogUpdate();
    updateTurnUI();

    const aiTurn = modeSel.value !== "pvp" && current === "O";
    if (aiTurn) {
      setStatus("AI is thinking…", true);
      disableAll();
      clearTimeout(aiTimer);
      aiTimer = setTimeout(playAiMove, 350);
    } else {
      setStatus(
        current === HUMAN
          ? "Your turn"
          : modeSel.value === "pvp" ? "Player O's turn" : "AI's turn"
      );
    }
  }

  // AI responds after the human moved.
  function playAiMove() {
    aiTimer = null;
    if (!running) return;                          // game over / restarted
    let move = aiBestMove(board);
    if (!Number.isInteger(move) || move < 0 || move > 8 || board[move]) {
      move = openCells(board)[0];                  // defensive fallback (Fix 4)
    }
    if (!Number.isInteger(move) || board[move]) {  // board unexpectedly full
      current = HUMAN;
      setStatus("Your turn");
      return;
    }
    placeMark(move, "O");
    afterMove();
  }

  /* ================= V2: Undo ================= */
  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      if (!moveStack.length) return;
      clearTimeout(aiTimer); aiTimer = null;       // cancel a pending AI reply
      // PvP rewinds one move; vs AI rewinds both the AI's reply and our move.
      let pops = 1;
      if (modeSel.value !== "pvp" && moveStack[moveStack.length - 1].mark === "O" && moveStack.length >= 2) {
        pops = 2;
      }
      for (let k = 0; k < pops && moveStack.length; k++) undoPlace();
      running = true;
      clearStrike(); confettiClear();
      cells.forEach((c) => c.classList.remove("win"));
      current = moveStack.length % 2 === 0 ? "X" : "O";  // X always opens the round
      cells.forEach((c, i) => {
        const top = moveStack.length && moveStack[moveStack.length - 1].i === i;
        c.classList.toggle("last", !!top);
      });
      fogUpdate(); renderTurnsAfterUndo();
      SFX.undo(); haptic(8);
    });
  }
  function renderTurnsAfterUndo() {
    updateTurnUI();
    if (undoBtn) undoBtn.disabled = moveStack.length === 0;
    setStatus(
      modeSel.value === "pvp"
        ? "Player " + current + "'s turn"
        : (current === HUMAN ? "Your turn" : "AI's turn")
    );
    setPlayable();
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

  /* ---------- V2: theme sound/fog controls ---------- */
  function paintSound() {
    if (!soundBtn) return;
    soundBtn.textContent = settings.mute ? "\u{1F507} Muted" : "\u{1F50A} Sound";
    soundBtn.classList.toggle("off", settings.mute);
  }
  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      SFX.unlock();
      settings.mute = !settings.mute;
      saveSettings(); paintSound();
      if (!settings.mute) SFX.ui();
    });
  }
  function paintFog() {
    if (!fogBtn) return;
    fogBtn.classList.toggle("on", settings.fog);
  }
  if (fogBtn) {
    fogBtn.addEventListener("click", () => {
      SFX.unlock();
      settings.fog = !settings.fog;
      saveSettings(); paintFog(); fogUpdate(); SFX.ui();
    });
  }
  // V2: theme swatches — [data-theme] tokens + circular reveal overlay
  const swatches = document.querySelectorAll(".swatch");
  function paintThemeBtns() {
    swatches.forEach((s) => {
      s.classList.toggle("on", s.dataset.theme === settings.theme);
    });
  }
  function applyTheme(name) {
    try { if (document.documentElement) document.documentElement.setAttribute("data-theme", name); }
    catch (_) {}
    const meta = document.querySelector && document.querySelector('meta[name="theme-color"]');
    if (meta && meta.setAttribute) {
      const bgMap = { neon: "#0f172a", chalk: "#22332b", sunset: "#1f1130", mono: "#101214" };
      if (bgMap[name]) meta.setAttribute("content", bgMap[name]);
    }
  }
  swatches.forEach((sw) => {
    sw.addEventListener("click", () => {
      SFX.unlock();
      if (sw.dataset.theme === settings.theme) return;
      const rect = sw.getBoundingClientRect;
      let px = 0, py = 0;
      try { if (typeof rect === "function") { const r = sw.getBoundingClientRect(); px = r.left + r.width / 2; py = r.top + r.height / 2; } }
      catch (_) {}
      const old = settings.theme;
      const oldBg = (typeof window !== "undefined" && window.getComputedStyle &&
        document.querySelector('[data-theme="' + old + '"]'))
        ? window.getComputedStyle(document.querySelector('[data-theme="' + old + '"]')).getPropertyValue("--bg").trim()
        : "";
      applyTheme(sw.dataset.theme);
      settings.theme = sw.dataset.theme;
      saveSettings(); paintThemeBtns();
      // circular wipe: old-theme colored overlay shrinks into the clicked swatch
      try {
        if (document.body && document.createElement && oldBg &&
            typeof window !== "undefined" && window.getComputedStyle) {
          const ov = document.createElement("div");
          ov.style.cssText = "position:fixed;inset:0;z-index:99;pointer-events:none;background:" + oldBg +
            ";clip-path:circle(160% at " + px + "px " + py + "px);transition:clip-path .45s ease";
          document.body.appendChild(ov);
          raf(() => { ov.style.clipPath = "circle(0% at " + px + "px " + py + "px)"; });
          setTimeout(() => { if (ov.remove) ov.remove(); }, 500);
        }
      } catch (_) { /* reveal is cosmetic */ }
      SFX.tone("sine", 784, 988, 0.12, 0.06);
    });
  });

  /* ---------- controls ---------- */
  cells.forEach((cell) => cell.addEventListener("click", () => {
    SFX.unlock();
    const idx = Number(cell.dataset.index);
    if (modeSel.value !== "pvp" && current !== "X") return;   // never click into the AI's slot
    handleMove(idx);
  }));

  modeSel.addEventListener("change", resetAll);   // switching matchup → fresh board + score

  restartBtn.addEventListener("click", newGame);  // New Game → new board, score kept

  // Start a new round: resets the board but KEEPS the running score.
  // State reset is synchronous (tests + real flow depend on it); the
  // stagger/flip is a purely visual after-effect.
  function newGame() {
    if (staggerTimers.length) { staggerTimers.forEach(clearTimeout); staggerTimers = []; }
    clearTimeout(aiTimer);
    aiTimer = null;
    clearStrike(); confettiClear();
    const wasDirty = board.some((v) => v !== "");
    const visual = !reduceMotion();
    board = Array(9).fill("");
    current = HUMAN;
    running = true;
    moveStack = [];
    if (undoBtn) undoBtn.disabled = true;
    render();
    cells.forEach((c) => {
      c.classList.remove("last", "faded", "out", "win");
      removeGlyph(c);
    });
    updateScores();
    fogUpdate();
    updateTurnUI();
    setStatus(`Player ${HUMAN}'s turn`);
    if (wasDirty && visual) {                       // stagger-out, then drop back in
      const timing = [];
      cells.forEach((c, i) => {
        const d = Math.abs(Math.floor(i / 3) - 1) + Math.abs((i % 3) - 1);
        timing.push([c, (d * 40)]);
        styleVar(c, "--d", (d * 40) + "ms");
        c.classList.add("out");
      });
      const wait = 140 + 320;                       // fly out …

      // … then clear residual glyphs and drop the empty cells back in
      staggerTimers.push(setTimeout(() => {
        cells.forEach((c) => {
          c.classList.remove("out", "win");
          removeGlyph(c);
        });
        // re-trigger the entrance stagger: add .enter from a clean frame
        cells.forEach((c) => c.classList.remove("enter"));
        try { cells.forEach((c) => { void c.offsetWidth; }); } catch (_) {}
        timing.forEach(([c, d]) => {
          styleVar(c, "--d", d + "ms");
          c.classList.add("enter");
        });
      }, wait));
      staggerTimers.push(setTimeout(() => {         // clean-up pass for transitions
        cells.forEach((c) => styleVar(c, "--d", "0ms"));
      }, wait + 600));
    }
  }

  // Full reset (page load / mode change): board + scoreboard to zero.
  function resetAll() {
    scores = { X: 0, O: 0, draw: 0 };
    newGame();
  }

  /* ---------- V2 boot ---------- */
  applyTheme(settings.theme);
  paintSound();
  paintFog();
  paintThemeBtns();
  // start fresh on load
  resetAll();     // zero board + status
  loadScores();   // restore saved totals after that
  updateScores(); // paint restored totals (also re-persists them)
})();
