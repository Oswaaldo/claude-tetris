# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A classic Tetris implementation in vanilla JavaScript, HTML5 Canvas, and CSS. No dependencies, no build system, no package.json — just three files that cooperate directly.

## Running the game

There is no build/lint/test tooling. To run:

```bash
open index.html        # macOS — opens directly in the browser
```

Or serve it locally (needed if browser security policies interfere with local file access):

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then visit `http://localhost:8000`.

## Architecture

The whole game lives in three files with a strict separation:

- `index.html` — DOM structure only: the `#board` canvas (300×600, i.e. `COLS × BLOCK` by `ROWS × BLOCK`), the side panel (score/lines/level/next-piece canvas/controls), and the pause/game-over overlay.
- `style.css` — dark/retro arcade visual styling only.
- `game.js` — all game logic, in one file, using global module-level state (no classes, no modules).

### Core state and game loop

Global mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) is declared once and reset in `init()`. The loop is driven by `requestAnimationFrame`:

```
init() → createBoard() → next = randomPiece() → spawn() → requestAnimationFrame(loop)

loop(ts):
  accumulate dt since last frame
  if dt >= dropInterval: advance piece down one row, or lockPiece() if blocked
  draw()
  requestAnimationFrame(loop)
```

Keyboard input (`keydown` listener) handles horizontal movement, rotation, soft drop, hard drop, and pause — all gated on `!paused && !gameOver`.

### Key mechanics to know before modifying

- **Board model**: `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1–7` identifying which piece locked there.
- **Pieces**: defined as square matrices in `PIECES` (index 0 unused, 1–7 are I/O/T/S/Z/J/L). Rotation (`rotateCW`) is a transpose + row reversal — it returns a new matrix rather than mutating in place.
- **Collision** (`collide`): checks board bounds and existing locked cells; used both for movement and for probing rotation/ghost placement.
- **Wall kicks** (`tryRotate`): after rotating, tries horizontal offsets `[0, -1, 1, -2, 2]` in order and takes the first that doesn't collide, before giving up on the rotation.
- **Ghost piece** (`ghostY`): simulates dropping the current piece straight down via repeated `collide` checks; drawn with `globalAlpha = 0.2`.
- **Locking a piece** (`lockPiece`): `merge()` (bakes piece into `board`) → `clearLines()` → `spawn()` (promotes `next` to `current`, generates new `next`; if the new piece immediately collides, calls `endGame()`).
- **Line clears** (`clearLines`): scans bottom-to-top, splices out full rows and unshifts empty ones at the top; re-checks the same row index after a splice (`r++` inside the loop).
- **Scoring/leveling**: `LINE_SCORES = [0, 100, 300, 500, 800]` × `level` for line clears; hard drop adds 2 pts/row dropped, soft drop 1 pt/row. Level increases every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)` ms.

### Tunable constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK` (cell pixel size), `COLORS`, `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK` and `ROWS × BLOCK`).
