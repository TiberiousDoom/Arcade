/* Angle Iron — pure logic core.
   A brick-breaker: the paddle sets the ball's outgoing angle.
   No DOM, no canvas, no timers, no randomness. Everything here is deterministic
   and testable; the HTML shell owns rendering, input, and the frame loop. */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- geometry ---------- */

/** Both layouts share one brick grid — 8 rows by 9 columns — and differ only
 *  in pixel geometry. That is deliberate: it means a brick at (row, col) exists
 *  on both boards, so rotating the phone can carry damage across index-for-index
 *  instead of throwing the level away. See `relayout`. */
export const BRICK_ROWS = 8;
export const BRICK_COLS = 9;

export const LAYOUT = {
  W: 800, H: 600,
  WALL: 12,                 // thickness of the left/right/top playfield border
  THUMB: 0,                 // landscape rests thumbs in the side gutters instead
  PADDLE_W: 112, PADDLE_H: 14,
  get FLOOR() { return this.H - this.THUMB; },   // the line a ball dies past
  get PADDLE_Y() { return this.FLOOR - 46; },    // top edge of the paddle
  BALL_R: 8,
  // Brick width is derived so the columns fill the space between the margins
  // exactly; only the row height and gaps are fixed here.
  BRICK_TOP: 72, MARGIN: 40,
  BRICK_ROWS, BRICK_COLS,
  BRICK_H: 22, BRICK_GAP: 6,
};

/** Portrait phones get a narrower, taller board plus an empty band beneath the
 *  paddle. The band is a thumb rest: the paddle tracks only the horizontal
 *  position of your finger, so resting it below the floor line steers perfectly
 *  well without your hand covering the play area. Same reasoning as Serpent
 *  Battery's LAYOUT_TALL. */
export const LAYOUT_TALL = {
  // 1:2 — squarer than a modern phone (~0.46) but much closer than the
  // landscape board, so the court fills the screen instead of floating in a
  // band of dead space. Deliberately not matched exactly to one handset: a
  // board tuned to 19.5:9 would letterbox badly on an iPad or an older 16:9.
  W: 600, H: 1200,
  WALL: 12,
  // Deep enough to park a thumb below the floor line without reaching. Tuned
  // on a real phone; the first attempt at 190 sat too close to the paddle.
  THUMB: 250,
  PADDLE_W: 92, PADDLE_H: 14,
  get FLOOR() { return this.H - this.THUMB; },
  get PADDLE_Y() { return this.FLOOR - 46; },
  BALL_R: 8,
  BRICK_TOP: 80, MARGIN: 26,
  BRICK_ROWS, BRICK_COLS,
  BRICK_H: 22, BRICK_GAP: 6,
};

/** Width of one brick, derived from the column count so the field is flush
 *  with the margins regardless of how many columns a layout uses. */
export function brickWidth(L = LAYOUT) {
  const field = L.W - 2 * L.MARGIN;
  return (field - (L.BRICK_COLS - 1) * L.BRICK_GAP) / L.BRICK_COLS;
}

/* ---------- ball dynamics ---------- */

export const BALL_SPEED = 340;          // px/sec at level 1, on the reference board
export const SPEED_PER_LEVEL = 0.06;    // +6% per level, so pace climbs
export const BALL_SPEED_MAX = 560;

/** The playable height the speeds above are tuned against. */
export const REF_FLOOR = LAYOUT.FLOOR;

/** Launch and per-hit speed for a given level. A ball keeps this magnitude for
 *  its whole life — every bounce only changes direction — so difficulty is set
 *  entirely here rather than drifting as the ball rattles around.
 *
 *  Scaled by the board's playable height so a ball crosses it in the same time
 *  on any layout: absolute px/s would make the taller portrait board play
 *  noticeably slower and easier. Serpent Battery does the same thing by
 *  deriving wave speed from path length. */
export function levelSpeed(level, L = LAYOUT) {
  const base = Math.min(BALL_SPEED_MAX, BALL_SPEED * (1 + (level - 1) * SPEED_PER_LEVEL));
  return base * (L.FLOOR / REF_FLOOR);
}

/** How far off vertical the ball leaves the paddle, mapped from where it lands:
 *  centre sends it straight up, the edges kick it out near 60°. This is the
 *  whole control scheme — the paddle is a protractor, not just a wall. */
export const PADDLE_MAX_ANGLE = 1.05;   // ~60° from vertical
/** Slight lean on the opening launch so the first ball is never a dead-vertical
 *  bore straight up and back down. */
export const LAUNCH_ANGLE = 0.35;

/* ---------- bricks ---------- */

/** Rows are tougher toward the top: the back rows take three hits, the front
 *  row one. Uniform within a horizontal band so the colouring reads as strata. */
export function brickHp(row, rows = LAYOUT.BRICK_ROWS) {
  return clamp(Math.ceil((rows - row) / 2), 1, 3);
}

/** Points for clearing a brick, scaled by how much armour it had. */
export function brickScore(maxhp) {
  return maxhp * 10;
}

/** Whether a cell is filled, per level. Level 1 is a solid wall; later levels
 *  carve deterministic shapes so the field isn't the same rectangle forever.
 *  Pure arithmetic on (row, col) — no randomness, so a given level is identical
 *  every run and every test. */
export function brickPresent(level, r, c, rows = LAYOUT.BRICK_ROWS, cols = LAYOUT.BRICK_COLS) {
  switch ((level - 1) % 4) {
    case 0: return true;                                   // solid wall
    case 1: return (r + c) % 2 === 0;                      // checkerboard
    case 2: {                                              // centred pyramid
      const mid = (cols - 1) / 2;
      return Math.abs(c - mid) <= r;
    }
    case 3: {                                              // hollow frame + spine
      const edge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      return edge || c === Math.floor((cols - 1) / 2);
    }
  }
  return true;
}

/** Build the brick field for a level. Each brick carries its own rectangle so
 *  collision never has to reconstruct positions from indices. */
export function buildBricks(level = 1, L = LAYOUT) {
  const bw = brickWidth(L);
  const bricks = [];
  for (let r = 0; r < L.BRICK_ROWS; r++) {
    for (let c = 0; c < L.BRICK_COLS; c++) {
      // pass the layout's own dimensions — relying on brickPresent's defaults
      // silently used the landscape grid whatever board was being built
      if (!brickPresent(level, r, c, L.BRICK_ROWS, L.BRICK_COLS)) continue;
      const hp = brickHp(r, L.BRICK_ROWS);
      bricks.push({
        x: L.MARGIN + c * (bw + L.BRICK_GAP),
        y: L.BRICK_TOP + r * (L.BRICK_H + L.BRICK_GAP),
        w: bw, h: L.BRICK_H,
        row: r, col: c,
        hp, maxhp: hp, alive: true, flash: 0,
      });
    }
  }
  return bricks;
}

export const aliveBricks = (w) => w.bricks.filter(b => b.alive).length;

/* ---------- powerups ---------- */

/** The four drops. `wide` and `slow` are timed; `multi` and `life` fire once.
 *  Kept as data so the shell can label and colour them without a second table. */
export const POWERUPS = {
  multi: { name: 'Split',  col: '#6fb7e8', timed: false },
  wide:  { name: 'Wide',   col: '#3fae8f', timed: true  },
  slow:  { name: 'Slow',   col: '#c9a227', timed: true  },
  life:  { name: 'Spare',  col: '#e0503c', timed: false },
};
export const POWERUP_KEYS = Object.keys(POWERUPS);

export const DROP_SPEED = 150;        // px/sec a capsule falls
export const DROP_R = 11;             // catch radius, generous on purpose
export const EFFECT_SECONDS = 12;     // how long a timed effect lasts
export const WIDE_MULT = 1.6;         // paddle width while `wide` is up
export const SLOW_MULT = 0.72;        // speed multiplier while `slow` is up
export const MAX_BALLS = 6;           // ceiling so repeat splits can't run away
export const SPLIT_ANGLE = 0.42;      // how far the two new balls fan out

/** Which powerup a brick at (row, col) yields on level `level`, or null for
 *  most bricks. Pure arithmetic — this engine has no randomness anywhere, so a
 *  level's drops sit in the same places every run and in every test, and are
 *  therefore learnable. Same reasoning as `brickPresent`.
 *
 *  The weighting lives in the table's repeats rather than in a branch: `wide`
 *  and `multi` are common, `life` is one entry in eight. */
const DROP_KINDS = ['multi', 'wide', 'slow', 'wide', 'multi', 'slow', 'wide', 'life'];

export function dropFor(level, row, col) {
  const h = (row * 7 + col * 13 + level * 11) >>> 0;
  if (h % 7 !== 3) return null;                    // roughly one brick in seven
  return DROP_KINDS[(h >> 3) % DROP_KINDS.length];
}

/** Ball speed right now: the level's pace, scaled if `slow` is running. All
 *  speed still comes from one place — the point of `levelSpeed` was that pace
 *  can't drift as the ball rattles around, and a visible, timed modifier keeps
 *  that property while making the powerup possible. */
export function effectiveSpeed(w) {
  const base = levelSpeed(w.level, w.L);
  return w.effects.slow > 0 ? base * SLOW_MULT : base;
}

/** Rescale every live ball to the current effective speed, keeping direction.
 *  Called when `slow` starts and when it lapses. */
function retimeBalls(w) {
  const spd = effectiveSpeed(w);
  for (const b of w.balls) {
    const m = Math.hypot(b.vx, b.vy);
    if (m === 0) continue;
    b.vx = (b.vx / m) * spd;
    b.vy = (b.vy / m) * spd;
  }
}

/** Paddle width for the current effect state. */
function paddleWidth(w) {
  return w.effects.wide > 0 ? w.L.PADDLE_W * WIDE_MULT : w.L.PADDLE_W;
}

/** Split each live ball into three, fanning the copies out either side of the
 *  original heading. Respects MAX_BALLS, so stacked splits taper off instead of
 *  filling the board. */
function splitBalls(w) {
  const room = MAX_BALLS - w.balls.length;
  if (room <= 0) return;
  const added = [];
  for (const b of w.balls) {
    if (added.length + 1 > room) break;
    const ang = Math.atan2(b.vy, b.vx);
    const spd = Math.hypot(b.vx, b.vy);
    for (const off of [SPLIT_ANGLE, -SPLIT_ANGLE]) {
      if (added.length >= room) break;
      added.push(makeBall(b.x, b.y, Math.cos(ang + off) * spd, Math.sin(ang + off) * spd, b.r));
    }
  }
  w.balls.push(...added);
}

/** Apply a caught powerup. Timed kinds refresh their full duration rather than
 *  stacking, which keeps the HUD honest and the maths trivial. */
export function applyPowerup(w, kind) {
  switch (kind) {
    case 'multi': splitBalls(w); break;
    case 'life':  w.lives++; break;
    case 'wide':
      w.effects.wide = EFFECT_SECONDS;
      w.paddle.w = paddleWidth(w);
      setPaddle(w, w.paddle.x);        // re-clamp: a wider bar may now overlap a wall
      break;
    case 'slow':
      w.effects.slow = EFFECT_SECONDS;
      retimeBalls(w);
      break;
    default: return false;
  }
  // optional-chained like Serpent Battery's fx hooks: worlds built without a
  // `power` hook (every older caller, and most tests) must not throw
  w.fx.power?.(kind);
  return true;
}

/** Drop timers and any falling capsules, cleared between lives and levels. */
function clearEffects(w) {
  w.drops = [];
  w.effects = { wide: 0, slow: 0 };
  w.paddle.w = w.L.PADDLE_W;
}

/* ---------- collision primitives ---------- */

/** True if a circle overlaps an axis-aligned rectangle. */
export function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

/** Resolve a ball against one rectangle. Returns the surface normal and the
 *  penetration depth to back the ball out by, or null if they don't touch.
 *  Uses the least-penetration face of the Minkowski-expanded rectangle, which
 *  picks the correct wall on edge hits and a sensible one on corner hits. */
export function rectHit(ball, rx, ry, rw, rh) {
  if (!circleRect(ball.x, ball.y, ball.r, rx, ry, rw, rh)) return null;
  const r = ball.r;
  const left = ball.x - (rx - r);
  const right = (rx + rw + r) - ball.x;
  const top = ball.y - (ry - r);
  const bottom = (ry + rh + r) - ball.y;
  const min = Math.min(left, right, top, bottom);
  if (min === left) return { nx: -1, ny: 0, push: left };
  if (min === right) return { nx: 1, ny: 0, push: right };
  if (min === top) return { nx: 0, ny: -1, push: top };
  return { nx: 0, ny: 1, push: bottom };
}

/** Reflect the ball off a face and lift it clear, so the next sub-step doesn't
 *  re-detect the same overlap. The normal points from the surface toward the
 *  ball, so the outgoing velocity along that axis takes the normal's sign. */
function bounce(ball, hit) {
  if (hit.nx !== 0) ball.vx = Math.abs(ball.vx) * hit.nx;
  if (hit.ny !== 0) ball.vy = Math.abs(ball.vy) * hit.ny;
  ball.x += hit.nx * hit.push;
  ball.y += hit.ny * hit.push;
}

/* ---------- world ---------- */

export const START_LIVES = 3;

export function createWorld(opts = {}) {
  const L = { ...LAYOUT, ...(opts.layout || {}) };
  const w = {
    L,
    paddle: { x: L.W / 2, w: L.PADDLE_W },
    balls: [],            // live, moving balls
    held: true,           // a ball is resting on the paddle, awaiting launch
    bricks: buildBricks(1, L),
    drops: [],            // powerup capsules falling toward the paddle
    effects: { wide: 0, slow: 0 },   // seconds remaining on each timed effect
    level: 1, score: 0, lives: START_LIVES,
    running: false, over: false,
    levelClear: false,
    fx: opts.fx || { brick() {}, bounce() {}, lose() {}, power() {} },
  };
  return w;
}

/* ---------- saving a run in progress ---------- */

/** A JSON-safe picture of a run. Bricks are stored as damage keyed by cell
 *  rather than as a list of rectangles: the field is rebuilt from `level` on
 *  the way back in and the damage laid over it, exactly as `relayout` does, so
 *  a save also survives being restored onto the other board shape. */
export function snapshot(w) {
  return {
    level: w.level, score: w.score, lives: w.lives,
    over: w.over, levelClear: w.levelClear, held: w.held,
    paddleFrac: w.paddle.x / w.L.W,     // fraction, so it survives a board change
    effects: { ...w.effects },
    balls: w.balls.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r })),
    drops: w.drops.map(d => ({ kind: d.kind, x: d.x, y: d.y, vy: d.vy })),
    bricks: w.bricks.map(b => ({ row: b.row, col: b.col, hp: b.hp, alive: b.alive })),
  };
}

/** Restore a snapshot onto an existing world, in place. Returns false and
 *  changes nothing if the snapshot is unusable. */
export function hydrate(w, snap) {
  if (!snap || typeof snap !== 'object') return false;
  if (typeof snap.level !== 'number' || snap.level < 1) return false;
  if (!Array.isArray(snap.bricks) || !Array.isArray(snap.balls)) return false;
  if (!Array.isArray(snap.drops)) return false;
  // a capsule kind this build no longer has would break the glyph and effect
  // lookups the moment it was caught
  if (snap.drops.some(d => !POWERUPS[d.kind])) return false;

  w.level = Math.floor(snap.level);
  w.score = snap.score ?? 0;
  w.lives = snap.lives ?? START_LIVES;
  w.over = !!snap.over;
  w.levelClear = !!snap.levelClear;
  w.held = snap.held ?? true;

  // rebuild this level's field, then lay the saved damage over it by cell
  w.bricks = buildBricks(w.level, w.L);
  const damage = new Map(snap.bricks.map(b => [`${b.row},${b.col}`, b]));
  for (const b of w.bricks) {
    const was = damage.get(`${b.row},${b.col}`);
    if (was) { b.hp = was.hp; b.alive = !!was.alive; b.flash = 0; }
  }

  w.effects = { wide: snap.effects?.wide || 0, slow: snap.effects?.slow || 0 };
  w.paddle.w = w.effects.wide > 0 ? w.L.PADDLE_W * WIDE_MULT : w.L.PADDLE_W;
  setPaddle(w, (snap.paddleFrac ?? 0.5) * w.L.W);

  w.balls = snap.balls.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: w.L.BALL_R }));
  w.drops = snap.drops.map(d => ({ kind: d.kind, x: d.x, y: d.y, vy: d.vy ?? DROP_SPEED }));
  return true;
}

/** Reset every run-scoped value back to a fresh level 1. */
export function resetGame(w) {
  w.level = 1; w.score = 0; w.lives = START_LIVES;
  w.over = false; w.levelClear = false;
  w.bricks = buildBricks(1, w.L);
  w.balls = []; w.held = true;
  clearEffects(w);
  w.paddle.x = w.L.W / 2;
}

/** Move an in-progress game onto a different board, as when the phone is
 *  rotated. Lossless for everything that matters: level, score, lives and the
 *  exact damage state of every brick survive, because both layouts share one
 *  brick grid and only differ in pixel geometry.
 *
 *  The ball is the one casualty — its position and heading mean nothing on a
 *  board of another shape — so it is re-racked on the paddle. */
export function relayout(w, L2) {
  const rebuilt = buildBricks(w.level, L2);
  const byCell = new Map(w.bricks.map(b => [`${b.row},${b.col}`, b]));
  for (const b of rebuilt) {
    const was = byCell.get(`${b.row},${b.col}`);
    if (was) { b.hp = was.hp; b.alive = was.alive; b.flash = 0; }
  }

  const centreFrac = w.paddle.x / w.L.W;      // keep the paddle where it sat
  w.L = L2;
  w.bricks = rebuilt;
  w.balls = [];
  w.held = true;
  // capsules in flight go the way the ball does — their position means nothing
  // on a board of another shape — but timed effects are earned, so they persist
  // and the paddle is re-widened against the new layout's base width.
  w.drops = [];
  w.paddle.w = paddleWidth(w);
  setPaddle(w, centreFrac * L2.W);
  return w;
}

/* ---------- paddle ---------- */

/** Half the paddle width plus the wall inset — the paddle centre can't go past
 *  this from either edge, so the bar never overlaps the border. */
function paddleLimit(w) {
  return w.L.WALL + w.paddle.w / 2;
}

/** Set the paddle centre directly (pointer control), clamped to the walls. */
export function setPaddle(w, x) {
  const lim = paddleLimit(w);
  w.paddle.x = clamp(x, lim, w.L.W - lim);
}

/** Nudge the paddle by a delta (keyboard control), clamped to the walls. */
export function nudgePaddle(w, dx) {
  setPaddle(w, w.paddle.x + dx);
}

/** Where a held ball sits: centred on the paddle, resting on its top edge. */
export function heldBallPos(w) {
  return { x: w.paddle.x, y: w.L.PADDLE_Y - w.L.BALL_R - 1 };
}

/* ---------- ball lifecycle ---------- */

function makeBall(x, y, vx, vy, r) {
  return { x, y, vx, vy, r };
}

/** Release the held ball. It leaves the paddle at the fixed launch lean, aimed
 *  upward. No-op if there's no ball waiting. */
export function launch(w) {
  if (!w.held) return false;
  const p = heldBallPos(w);
  const spd = effectiveSpeed(w);
  w.balls.push(makeBall(p.x, p.y, spd * Math.sin(LAUNCH_ANGLE), -spd * Math.cos(LAUNCH_ANGLE), w.L.BALL_R));
  w.held = false;
  return true;
}

/** A ball fell past the bottom and no others remain: spend a life, and either
 *  rack a fresh ball on the paddle or end the run. */
function loseLife(w) {
  w.lives--;
  w.balls = [];
  // a fresh ball starts clean: losing the board loses whatever was running on it
  clearEffects(w);
  w.fx.lose();
  if (w.lives <= 0) { w.lives = 0; w.over = true; w.running = false; }
  else w.held = true;
}

/* ---------- collision passes ---------- */

/** Ball against the three solid borders. The bottom is deliberately open — a
 *  ball that leaves the floor is a lost ball, handled by the caller. */
function wallBounce(w, ball) {
  const L = w.L, r = ball.r;
  if (ball.x - r < L.WALL) { ball.x = L.WALL + r; ball.vx = Math.abs(ball.vx); w.fx.bounce(); }
  else if (ball.x + r > L.W - L.WALL) { ball.x = L.W - L.WALL - r; ball.vx = -Math.abs(ball.vx); w.fx.bounce(); }
  if (ball.y - r < L.WALL) { ball.y = L.WALL + r; ball.vy = Math.abs(ball.vy); w.fx.bounce(); }
}

/** Ball against the paddle. Only bites when the ball is descending, so a ball
 *  clipping the side on its way up isn't yanked back down. The landing spot
 *  sets the outgoing angle; speed is preserved. */
function paddleBounce(w, ball) {
  if (ball.vy <= 0) return;
  const p = w.paddle, L = w.L;
  const px = p.x - p.w / 2;
  if (!circleRect(ball.x, ball.y, ball.r, px, L.PADDLE_Y, p.w, L.PADDLE_H)) return;
  const offset = clamp((ball.x - p.x) / (p.w / 2), -1, 1);
  const ang = offset * PADDLE_MAX_ANGLE;
  const spd = Math.hypot(ball.vx, ball.vy);
  ball.vx = spd * Math.sin(ang);
  ball.vy = -spd * Math.cos(ang);
  ball.y = L.PADDLE_Y - ball.r - 0.5;
  w.fx.bounce();
}

/** Ball against the brick field. At most one brick is resolved per call — the
 *  one the ball is deepest into — which keeps a corner clip between two bricks
 *  from reflecting twice and reversing the ball into itself. */
function brickBounce(w, ball) {
  let best = null, bestBrick = null;
  for (const b of w.bricks) {
    if (!b.alive) continue;
    const hit = rectHit(ball, b.x, b.y, b.w, b.h);
    if (hit && (!best || hit.push > best.push)) { best = hit; bestBrick = b; }
  }
  if (!best) return;
  bounce(ball, best);
  bestBrick.hp--;
  bestBrick.flash = 0.12;
  if (bestBrick.hp <= 0) {
    bestBrick.alive = false;
    w.score += brickScore(bestBrick.maxhp);
    w.fx.brick(bestBrick.x + bestBrick.w / 2, bestBrick.y + bestBrick.h / 2, bestBrick.row);
    const kind = dropFor(w.level, bestBrick.row, bestBrick.col);
    if (kind) {
      w.drops.push({
        kind,
        x: bestBrick.x + bestBrick.w / 2,
        y: bestBrick.y + bestBrick.h / 2,
        vy: DROP_SPEED,
      });
    }
  }
}

/** Advance falling capsules: catch the ones that reach the paddle, discard the
 *  ones that pass the floor. The catch test is against the paddle's own
 *  rectangle, so a wide paddle really is easier to collect with. */
function stepDrops(w, dt) {
  const L = w.L, p = w.paddle;
  for (let i = w.drops.length - 1; i >= 0; i--) {
    const d = w.drops[i];
    d.y += d.vy * dt;
    if (circleRect(d.x, d.y, DROP_R, p.x - p.w / 2, L.PADDLE_Y, p.w, L.PADDLE_H)) {
      w.drops.splice(i, 1);
      applyPowerup(w, d.kind);
      continue;
    }
    if (d.y - DROP_R > L.FLOOR) w.drops.splice(i, 1);
  }
}

/** Tick the timed effects down and undo them as they lapse. */
function stepEffects(w, dt) {
  if (w.effects.wide > 0) {
    w.effects.wide = Math.max(0, w.effects.wide - dt);
    if (w.effects.wide === 0) { w.paddle.w = w.L.PADDLE_W; setPaddle(w, w.paddle.x); }
  }
  if (w.effects.slow > 0) {
    w.effects.slow = Math.max(0, w.effects.slow - dt);
    if (w.effects.slow === 0) retimeBalls(w);   // back up to full pace
  }
}

/* ---------- simulation step ---------- */

/** Advance the world by dt seconds. The shell drives the paddle (via
 *  setPaddle/nudgePaddle) and launches (via launch) before calling this; step
 *  only simulates ball flight and its consequences. */
export function step(w, dt) {
  if (!w.running || w.over || w.levelClear || w.held) {
    // still let brick flash timers decay so a paused/cleared board settles
    for (const b of w.bricks) if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);
    return;
  }

  for (const b of w.bricks) if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);

  for (const ball of w.balls) {
    // Sub-step so a fast ball can't tunnel through a brick or the paddle in one
    // frame: no single move is longer than the ball's own radius.
    const dist = Math.hypot(ball.vx, ball.vy) * dt;
    const n = Math.max(1, Math.ceil(dist / ball.r));
    const sub = dt / n;
    for (let i = 0; i < n; i++) {
      ball.x += ball.vx * sub;
      ball.y += ball.vy * sub;
      wallBounce(w, ball);
      brickBounce(w, ball);
      paddleBounce(w, ball);
    }
  }

  // drop any ball that fell past the floor. FLOOR, not H: on a portrait board
  // the thumb rest sits below the floor line, and a ball must die at the paddle
  // line rather than sailing on through the band where your hand is.
  // capsules and timers advance after the balls, so a brick broken this frame
  // drops a capsule that starts falling on the next one
  stepDrops(w, dt);
  stepEffects(w, dt);

  w.balls = w.balls.filter(b => b.y - b.r <= w.L.FLOOR);
  if (w.balls.length === 0 && !w.held) loseLife(w);

  if (aliveBricks(w) === 0 && !w.over) {
    w.levelClear = true;
    // clearing a board pays a bonus that grows with the level
    w.score += 100 + w.level * 50;
  }
}

/** Advance to the next level after a clear. The shell calls this once it has
 *  shown the between-levels beat. */
export function nextLevel(w) {
  w.level++;
  w.bricks = buildBricks(w.level, w.L);
  w.balls = []; w.held = true;
  clearEffects(w);
  w.levelClear = false;
  w.running = true;
}
