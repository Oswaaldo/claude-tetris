'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
  '#9e9e9e', // Nut - steel gray
  null,      // Hole (drawn as a ring, not a filled block)
];

const NUT = 8;
const HOLE = 9;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,9,8],[8,8,8]],                  // Nut - hole (9) counts as occupied
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const NUT_BONUS = 200;

const THEME_KEY = 'tetris-theme';
const GRID_COLORS = { dark: '#22222e', light: '#d5d5e2' };

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, combo, maxCombo, maxLines;
let theme = 'dark';

function applyTheme(t) {
  theme = t === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light', theme === 'light');
  themeToggle.checked = theme === 'light';
  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  applyTheme(stored === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
});

initTheme();

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  let nutRows = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      if (board[r].some(v => v === NUT || v === HOLE)) nutRows++;
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    score += nutRows * NUT_BONUS * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const cleared = clearLines();
  if (cleared > 0) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    maxLines = Math.max(maxLines, cleared);
  } else {
    combo = 0;
  }
  updateComboUI();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  // El hueco de la tuerca ocupa la celda en la lógica, pero no se dibuja nada.
  if (colorIndex === HOLE) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = GRID_COLORS[theme];
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (!gameOver) {
    // ghost
    const gy = ghostY();
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

    // current piece
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  draw();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  showGameOverScores();
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlayNewRecord.classList.add('hidden');
    overlayHighscoresEl.innerHTML = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver || paused) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  combo = 0;
  maxCombo = 0;
  maxLines = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  updateComboUI();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// ---- Records y combos ----

const HISCORE_KEY = 'tetris-highscores';

const comboSection = document.getElementById('combo-section');
const comboEl = document.getElementById('combo');
const startScreen = document.getElementById('start-screen');
const startHighscoresEl = document.getElementById('start-highscores');
const startAggregatesEl = document.getElementById('start-aggregates');
const playBtn = document.getElementById('play-btn');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const overlayHighscoresEl = document.getElementById('overlay-highscores');
const overlayNewRecord = document.getElementById('overlay-newrecord');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');

// Actualiza la sección de combo del panel lateral; solo visible con racha >= 2.
function updateComboUI() {
  comboSection.classList.toggle('hidden', combo < 2);
  comboEl.textContent = combo;
}

// Lee los records guardados en localStorage, degradando a array vacío ante cualquier problema.
function loadScores() {
  try {
    const raw = localStorage.getItem(HISCORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(e => e && typeof e === 'object'
      && typeof e.name === 'string'
      && typeof e.score === 'number'
      && typeof e.lines === 'number'
      && typeof e.level === 'number'
      && typeof e.maxCombo === 'number'
      && typeof e.maxLines === 'number'
      && typeof e.date === 'string');
  } catch (e) {
    return [];
  }
}

// Persiste el array de records en localStorage.
function saveScores(scores) {
  try {
    localStorage.setItem(HISCORE_KEY, JSON.stringify(scores));
  } catch (e) {
    // localStorage no disponible (modo privado, cuota llena, etc.): se ignora.
  }
}

// Comprueba si una puntuación entraría en el top 5 actual.
function qualifiesForTop(scoreValue, scores) {
  if (scores.length < 5) return true;
  return scoreValue > scores[scores.length - 1].score;
}

// Inserta una nueva entrada en su posición correcta, trunca a 5 y persiste.
function insertScore(entry) {
  const scores = loadScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  scores.length = Math.min(scores.length, 5);
  saveScores(scores);
  return scores;
}

// Calcula el mejor combo y la mayor cantidad de líneas de entre las entradas guardadas.
function computeAggregates(scores) {
  let bestCombo = 0;
  let bestLines = 0;
  for (const s of scores) {
    if (s.maxCombo > bestCombo) bestCombo = s.maxCombo;
    if (s.maxLines > bestLines) bestLines = s.maxLines;
  }
  return { bestCombo, bestLines };
}

// Pinta una tabla de top 5 dentro de un contenedor, sin usar innerHTML con datos del jugador.
// highlightEntry (opcional) marca la fila recién insertada con la clase .highlight.
function renderHighscoresTable(scores, container, highlightEntry) {
  container.innerHTML = '';
  if (!scores.length) {
    const empty = document.createElement('p');
    empty.className = 'no-scores';
    empty.textContent = 'Sin puntuaciones todavía';
    container.appendChild(empty);
    return;
  }
  const table = document.createElement('table');
  table.className = 'highscores-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['#', 'Nombre', 'Puntos', 'Líneas', 'Nivel', 'Combo'].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  scores.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (entry === highlightEntry) tr.classList.add('highlight');
    [i + 1, entry.name, entry.score.toLocaleString(), entry.lines, entry.level, entry.maxCombo].forEach(val => {
      const td = document.createElement('td');
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

// Refresca la tabla y los agregados de la pantalla de inicio a partir de localStorage.
function refreshStartScreen() {
  const scores = loadScores();
  renderHighscoresTable(scores, startHighscoresEl);
  const { bestCombo, bestLines } = computeAggregates(scores);
  startAggregatesEl.textContent = `Mejor combo: ${bestCombo} · Máx. líneas: ${bestLines}`;
}

// Decide si mostrar el formulario de nombre (nueva entrada al top) o directamente la tabla.
function showGameOverScores() {
  const scores = loadScores();
  if (qualifiesForTop(score, scores)) {
    overlayNewRecord.classList.remove('hidden');
    overlayHighscoresEl.innerHTML = '';
    playerNameInput.value = '';
    saveScoreBtn.onclick = () => {
      const name = playerNameInput.value.trim() || 'Anónimo';
      const entry = {
        name,
        score,
        lines,
        level,
        maxCombo,
        maxLines,
        date: new Date().toISOString(),
      };
      const updated = insertScore(entry);
      overlayNewRecord.classList.add('hidden');
      renderHighscoresTable(updated, overlayHighscoresEl, entry);
      refreshStartScreen();
    };
  } else {
    overlayNewRecord.classList.add('hidden');
    renderHighscoresTable(scores, overlayHighscoresEl);
  }
}

playBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  init();
});

resetScoresBtn.addEventListener('click', () => {
  if (confirm('¿Seguro que quieres borrar todos los records guardados?')) {
    try {
      localStorage.removeItem(HISCORE_KEY);
    } catch (e) {
      // localStorage no disponible: se ignora.
    }
    refreshStartScreen();
  }
});

// Prepara el tablero vacío y el HUD inicial sin arrancar la partida.
// La partida arranca al pulsar "JUGAR" (ver playBtn arriba).
combo = 0;
maxCombo = 0;
maxLines = 0;
board = createBoard();
gameOver = true;
score = 0;
lines = 0;
level = 1;
draw();
updateHUD();
updateComboUI();
refreshStartScreen();
