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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
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
  clearLines();
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
  const activeSkin = SKINS[skin];
  activeSkin.draw(context, x, y, colorIndex, size, alpha, activeSkin.colors);
}

function drawGrid() {
  ctx.strokeStyle = SKINS[skin].gridColor || GRID_COLORS[theme];
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
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Skins visuales ----

// Oscurece (percent negativo) o aclara (percent positivo) un color hex '#rrggbb'.
function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const amount = Math.round(2.55 * percent);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0xff) + amount;
  let b = (num & 0xff) + amount;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const SKINS = {
  retro: {
    name: 'Retro',
    colors: COLORS,
    boardBg: null,
    gridColor: null,
    // Dibujado clásico: relleno plano + franja de highlight blanca al 12%.
    draw(context, x, y, colorIndex, size, alpha, colors) {
      const color = colors[colorIndex];
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.globalAlpha = 1;
    },
  },
  neon: {
    name: 'Neon',
    colors: [
      null,
      '#00fff2', // I
      '#faff00', // O
      '#ff00e6', // T
      '#00ff5e', // S
      '#ff1744', // Z
      '#2979ff', // J
      '#ff9100', // L
      '#b0bec5', // Nut
      null,
    ],
    boardBg: '#08080c',
    gridColor: 'rgba(0, 255, 242, 0.08)',
    // Relleno semitransparente + borde brillante con glow (shadowBlur).
    draw(context, x, y, colorIndex, size, alpha, colors) {
      const color = colors[colorIndex];
      const a = alpha ?? 1;
      const bx = x * size + 2;
      const by = y * size + 2;
      const bw = size - 4;
      const bh = size - 4;
      context.shadowBlur = 14;
      context.shadowColor = color;
      context.globalAlpha = a * 0.5;
      context.fillStyle = color;
      context.fillRect(bx, by, bw, bh);
      context.globalAlpha = a;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(bx, by, bw, bh);
      // Importante: resetear la sombra para que el glow no manche el resto del canvas.
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      context.globalAlpha = 1;
    },
  },
  pastel: {
    name: 'Pastel',
    colors: [
      null,
      '#a8e6ef', // I
      '#fff3b0', // O
      '#d8b4e2', // T
      '#b8e6c2', // S
      '#f3b8b8', // Z
      '#b8d4f3', // J
      '#f3d0a8', // L
      '#cfd8dc', // Nut
      null,
    ],
    boardBg: '#fdf6f0',
    gridColor: '#e8dcea',
    // Colores suaves con esquinas redondeadas (única excepción a "solo cuadrados").
    draw(context, x, y, colorIndex, size, alpha, colors) {
      const color = colors[colorIndex];
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      const rx = x * size + 1;
      const ry = y * size + 1;
      const rw = size - 2;
      const rh = size - 2;
      const radius = Math.min(6, rw / 2, rh / 2);
      if (typeof context.roundRect === 'function') {
        context.beginPath();
        context.roundRect(rx, ry, rw, rh, radius);
        context.fill();
      } else {
        context.fillRect(rx, ry, rw, rh);
      }
      context.fillStyle = 'rgba(255,255,255,0.3)';
      context.fillRect(rx + 3, ry + 3, rw - 6, 3);
      context.globalAlpha = 1;
    },
  },
  pixel: {
    name: 'Pixel art',
    colors: [
      null,
      '#00e5ff', // I
      '#ffeb3b', // O
      '#ab47bc', // T
      '#66bb6a', // S
      '#ef5350', // Z
      '#42a5f5', // J
      '#ffa726', // L
      '#78909c', // Nut
      null,
    ],
    boardBg: null,
    gridColor: null,
    // Patrón de textura: 4 sub-bloques alternando tonos + borde oscuro de 1px.
    draw(context, x, y, colorIndex, size, alpha, colors) {
      const color = colors[colorIndex];
      context.globalAlpha = alpha ?? 1;
      const bx = x * size + 1;
      const by = y * size + 1;
      const bw = size - 2;
      const bh = size - 2;
      const hw = bw / 2;
      const hh = bh / 2;
      const light = shadeColor(color, 15);
      const dark = shadeColor(color, -20);
      context.fillStyle = light;
      context.fillRect(bx, by, hw, hh);
      context.fillRect(bx + hw, by + hh, bw - hw, bh - hh);
      context.fillStyle = dark;
      context.fillRect(bx + hw, by, bw - hw, hh);
      context.fillRect(bx, by + hh, hw, bh - hh);
      context.strokeStyle = shadeColor(color, -40);
      context.lineWidth = 1;
      context.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      context.globalAlpha = 1;
    },
  },
};

const SKIN_KEY = 'tetris-skin';
const skinSelect = document.getElementById('skin-select');
let skin = 'retro';

function applySkin(id) {
  skin = SKINS[id] ? id : 'retro';
  const s = SKINS[skin];
  [canvas, nextCanvas].forEach(el => {
    if (s.boardBg) el.style.setProperty('--board-bg-skin', s.boardBg);
    else el.style.removeProperty('--board-bg-skin');
  });
  if (skinSelect) skinSelect.value = skin;
  try {
    localStorage.setItem(SKIN_KEY, skin);
  } catch (e) {
    /* localStorage no disponible: se pierde la preferencia entre sesiones */
  }
  // Redibuja de inmediato para que el cambio se vea aunque el juego esté pausado o en game over.
  draw();
  drawNext();
}

function initSkin() {
  let stored = 'retro';
  try {
    const saved = localStorage.getItem(SKIN_KEY);
    if (saved && SKINS[saved]) stored = saved;
  } catch (e) {
    /* localStorage no disponible: se usa el skin por defecto */
  }
  applySkin(stored);
}

if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    applySkin(skinSelect.value);
  });
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

init();
initSkin();
