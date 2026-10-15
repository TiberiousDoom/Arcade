/* Shield Wall — pure logic core.
   A formation of invaders marches down the board; one gun answers from behind
   four bunkers that both sides' fire wears away. No DOM, no canvas, no timers.
   The only randomness is a seeded LCG (`rand`), so a seed replays a run.

   The seam is Airburst's: `step(w, dt)` reads no input. The shell moves the gun
   (`setGun`/`nudgeGun`, both clamped) and asks to fire (`fire`), and the engine
   decides whether a shot is free — one in the air at a time, as the genre has
   always had it. */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- board ---------- */

/** One board, portrait (DECISIONS 2026-10-14). The gun runs along GUN_Y; below
 *  the ground line is a thumb band, as in Hull Breach: the gun follows only the
 *  finger's x, so a finger resting down there steers without covering play. */
export const LAYOUT = {
  W: 600, H: 1100,
  GUN_Y: 900,                // centre line of the gun
  GROUND_Y: 930,             // the ground; below it is the thumb band
  WALL: 14,                  // side margin the formation turns at
  get FLOOR() { return this.GUN_Y - 16; },   // invaders reaching this have landed
};

/* ---------- the formation ---------- */

export const COLS = 8;
export const ROWS = 5;
export const INV_SIZE = 26;          // a cube's face, px
export const COL_GAP = 54;           // centre to centre
export const ROW_GAP = 44;
export const STEP_X = 10;            // sideways per march step
export const DROP_Y = 22;            // down at each wall
export const TOP_Y = 150;            // where wave 1's top row starts
/** Each wave starts one notch lower, to a limit — the classic squeeze. */
export const WAVE_LOWER = 22;
export const LOWER_MAX = 5;

/** Points per row, top to bottom. */
export const ROW_POINTS = [30, 20, 20, 10, 10];
/** Row kind (for art): 0 top, 1 middle, 2 bottom. */
export const rowKind = (r) => (r === 0 ? 0 : r <= 2 ? 1 : 2);

/** Seconds between march steps. Slows nothing, speeds as it thins: the fewer
 *  left, the faster each one moves, which is the whole tension of the genre.
 *  Later waves start brisker. */
export function stepInterval(alive, total, wave) {
  const thin = Math.pow(alive / total, 1.25);
  const pace = Math.max(0.55, 1 - (wave - 1) * 0.07);
  return (0.045 + 0.6 * thin) * pace;
}

/* ---------- the gun ---------- */

export const GUN_W = 40;
export const GUN_SPEED = 380;        // keyboard nudge, px/s
export const SHOT_SPEED = 1100;
export const RESPAWN = 1.4;          // seconds without a gun after a hit
export const START_LIVES = 3;
export const EXTRA_LIFE_AT = 1500;

/* ---------- invader fire ---------- */

export const BOMB_SPEED = (wave) => Math.min(250 + wave * 15, 420);
export const BOMB_MAX = (wave) => Math.min(3 + Math.floor(wave / 3), 6);
/** Seconds between bomb attempts, before the per-attempt jitter. */
export const BOMB_GAP = (wave) => Math.max(0.32, 1.25 - wave * 0.08);
/** The share of bombs dropped from the column nearest the gun rather than a
 *  random one. The genre's original pressure: a player who parks under a
 *  column to shoot it is also standing where it shoots back, so firing and
 *  dodging have to be timed against each other. */
export const AIMED = (wave) => Math.min(0.5, 0.1 * wave);

/* ---------- the saucer ---------- */

export const SAUCER_Y = 96;
export const SAUCER_SPEED = 130;
export const SAUCER_POINTS = [50, 100, 150, 300];
export const SAUCER_W = 34;

/* ---------- bunkers ---------- */

export const BUNKERS = 4;
export const CELL = 5;               // px per cell
export const BUNKER_COLS = 14;
export const BUNKER_ROWS = 10;
export const BUNKER_Y = 790;         // top edge
/** The classic arch: corners clipped at the top, a doorway under the middle. */
export function bunkerShape(c, r) {
  if (r === 0 && (c < 2 || c > BUNKER_COLS - 3)) return 0;
  if (r === 1 && (c < 1 || c > BUNKER_COLS - 2)) return 0;
  if (r >= BUNKER_ROWS - 3 && c >= 4 && c <= BUNKER_COLS - 5) return 0;
  if (r === BUNKER_ROWS - 4 && c >= 5 && c <= BUNKER_COLS - 6) return 0;
  return 1;
}
export const bunkerX = (L, b) => {
  const w = BUNKER_COLS * CELL;
  const gap = (L.W - BUNKERS * w) / (BUNKERS + 1);
  return gap + b * (w + gap);
};

/* ---------- randomness ---------- */

/** The LCG the other games use, advanced on the world. */
export function rand(w) {
  w.seed = (Math.imul(w.seed, 1103515245) + 12345) & 0x7fffffff;
  return w.seed / 0x80000000;
}

/* ---------- world ---------- */

const noFx = { shoot() {}, kill() {}, hit() {}, shield() {}, saucer() {}, saucerKill() {}, step() {}, life() {} };

function newBunkers() {
  return Array.from({ length: BUNKERS }, () => {
    const cells = new Array(BUNKER_COLS * BUNKER_ROWS);
    for (let r = 0; r < BUNKER_ROWS; r++) for (let c = 0; c < BUNKER_COLS; c++) {
      cells[r * BUNKER_COLS + c] = bunkerShape(c, r);
    }
    return cells;
  });
}

function newFormation(wave) {
  const lower = Math.min(wave - 1, LOWER_MAX) * WAVE_LOWER;
  return {
    x: (LAYOUT.W - (COLS - 1) * COL_GAP) / 2,     // centre of column 0
    y: TOP_Y + lower,                              // centre of row 0
    dir: 1,
    t: 0,
    pose: 0,
    alive: Array(COLS * ROWS).fill(true),
  };
}

export function createWorld(opts = {}) {
  const L = opts.layout || LAYOUT;
  const w = {
    L,
    seed: (opts.seed ?? 20261015) & 0x7fffffff,
    fx: { ...noFx, ...(opts.fx || {}) },
    running: false, over: false, waveClear: false,
    wave: 1, score: 0, lives: START_LIVES, wavesCleared: 0, extraGiven: false,
    gun: { x: L.W / 2, dead: 0 },
    shot: null,
    bombs: [],
    saucer: null,
    saucerT: 0,
    bombT: 0,
    formation: null,
    bunkers: null,
  };
  startWave(w);
  return w;
}

function startWave(w) {
  w.formation = newFormation(w.wave);
  w.bunkers = newBunkers();
  w.shot = null; w.bombs = []; w.saucer = null;
  w.bombT = 1.2;
  w.saucerT = 16;
  w.waveClear = false;
}

export const aliveCount = (w) => w.formation.alive.filter(Boolean).length;

/** Centre of the invader at (c, r). */
export function invPos(w, c, r) {
  const f = w.formation;
  return { x: f.x + c * COL_GAP, y: f.y + r * ROW_GAP };
}

/** Left/right/bottom edges of what is still alive, for turning and landing. */
export function extent(w) {
  const f = w.formation;
  let minC = COLS, maxC = -1, maxR = -1;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!f.alive[r * COLS + c]) continue;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
    if (r > maxR) maxR = r;
  }
  if (maxC < 0) return null;
  return {
    left: f.x + minC * COL_GAP - INV_SIZE / 2,
    right: f.x + maxC * COL_GAP + INV_SIZE / 2,
    bottom: f.y + maxR * ROW_GAP + INV_SIZE / 2,
  };
}

/* ---------- the gun ---------- */

function gunLimit(w) { return w.L.WALL + GUN_W / 2; }

export function setGun(w, x) {
  w.gun.x = clamp(x, gunLimit(w), w.L.W - gunLimit(w));
}
export function nudgeGun(w, dx) { setGun(w, w.gun.x + dx); }

/** Fire if the gun is up and its one shot is free. Returns whether it fired. */
export function fire(w) {
  if (!w.running || w.over || w.waveClear) return false;
  if (w.gun.dead > 0 || w.shot) return false;
  w.shot = { x: w.gun.x, y: w.L.GUN_Y - 14 };
  w.fx.shoot(w.shot.x, w.shot.y);
  return true;
}

/* ---------- bunkers ---------- */

/** Is there a live bunker cell at (x, y)? Returns [bunker, index] or null. */
export function cellAt(w, x, y) {
  const r = Math.floor((y - BUNKER_Y) / CELL);
  if (r < 0 || r >= BUNKER_ROWS) return null;
  for (let b = 0; b < BUNKERS; b++) {
    const c = Math.floor((x - bunkerX(w.L, b)) / CELL);
    if (c < 0 || c >= BUNKER_COLS) continue;
    const i = r * BUNKER_COLS + c;
    return w.bunkers[b][i] ? [b, i] : null;
  }
  return null;
}

/** Bite a hole round a hit: the cell struck and a fixed ragged pattern round
 *  it. Fixed, not random, so damage costs no LCG advances — how much of a
 *  bunker the player shoots away must not change what the invaders do later. */
const BITE = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-2, 0], [1, -1]];
export function bite(w, b, i, up) {
  const c0 = i % BUNKER_COLS, r0 = Math.floor(i / BUNKER_COLS);
  for (const [dc, dr] of BITE) {
    const c = c0 + dc, r = r0 + (up ? -dr : dr);
    if (c < 0 || c >= BUNKER_COLS || r < 0 || r >= BUNKER_ROWS) continue;
    w.bunkers[b][r * BUNKER_COLS + c] = 0;
  }
}

/** Something travelling from y0 to y1 at x: the first live cell it meets. */
function sweepCells(w, x, y0, y1) {
  const dir = Math.sign(y1 - y0) || 1;
  for (let y = y0; dir > 0 ? y <= y1 : y >= y1; y += dir * (CELL / 2)) {
    const hit = cellAt(w, x, y);
    if (hit) return hit;
  }
  return null;
}

export const bunkerCells = (w, b) => w.bunkers[b].reduce((n, v) => n + v, 0);

/* ---------- step ---------- */

export function step(w, dt) {
  if (!w.running || w.over || w.waveClear) return;
  const L = w.L, f = w.formation;
  const total = COLS * ROWS;

  // the gun comes back after a hit
  if (w.gun.dead > 0) w.gun.dead = Math.max(0, w.gun.dead - dt);

  // march
  f.t += dt;
  const gap = stepInterval(aliveCount(w), total, w.wave);
  while (f.t >= gap) {
    f.t -= gap;
    march(w);
    if (w.over) return;
  }

  // invaders that reach a bunker grind through it
  grindBunkers(w);

  // the gun's shot
  if (w.shot) {
    const s = w.shot;
    const y1 = s.y - SHOT_SPEED * dt;
    const cell = sweepCells(w, s.x, s.y, y1);
    if (cell) { bite(w, cell[0], cell[1], true); w.fx.shield(s.x, s.y); w.shot = null; }
    else {
      const y0 = s.y;
      s.y = y1;
      if (!hitInvader(w, s, y0) && !hitSaucer(w, s, y0) && !hitBomb(w, s, y0, BOMB_SPEED(w.wave) * dt) && s.y < 40) w.shot = null;
    }
  }

  // invader fire: one attempt per tick, three LCG advances every time
  w.bombT -= dt;
  while (w.bombT <= 0) {
    const pick = rand(w), jitter = rand(w), aim = rand(w);
    w.bombT += BOMB_GAP(w.wave) * (0.6 + jitter * 0.8);
    if (w.bombs.length < BOMB_MAX(w.wave)) dropBomb(w, pick, aim < AIMED(w.wave));
  }
  for (let i = w.bombs.length - 1; i >= 0; i--) {
    const b = w.bombs[i];
    const y1 = b.y + BOMB_SPEED(w.wave) * dt;
    const cell = sweepCells(w, b.x, b.y, y1);
    if (cell) { bite(w, cell[0], cell[1], false); w.fx.shield(b.x, y1); w.bombs.splice(i, 1); continue; }
    b.y = y1;
    if (w.gun.dead === 0 && Math.abs(b.x - w.gun.x) < GUN_W / 2 && b.y >= L.GUN_Y - 10 && b.y <= L.GUN_Y + 12) {
      w.bombs.splice(i, 1);
      gunHit(w);
      if (w.over) return;
      continue;
    }
    if (b.y > L.GROUND_Y) w.bombs.splice(i, 1);
  }

  // the saucer: its own timer and its own rolls
  w.saucerT -= dt;
  if (w.saucerT <= 0) {
    const side = rand(w), next = rand(w), value = rand(w);
    w.saucerT = 18 + next * 10;
    if (!w.saucer) {
      const fromLeft = side < 0.5;
      w.saucer = { x: fromLeft ? -SAUCER_W : L.W + SAUCER_W, dir: fromLeft ? 1 : -1,
        points: SAUCER_POINTS[Math.floor(value * SAUCER_POINTS.length) % SAUCER_POINTS.length] };
      w.fx.saucer();
    }
  }
  if (w.saucer) {
    w.saucer.x += w.saucer.dir * SAUCER_SPEED * dt;
    if (w.saucer.x < -SAUCER_W * 2 || w.saucer.x > L.W + SAUCER_W * 2) w.saucer = null;
  }

  if (aliveCount(w) === 0) endWave(w);
}

function march(w) {
  const f = w.formation, L = w.L;
  const e = extent(w);
  if (!e) return;
  f.pose ^= 1;
  const nextL = e.left + f.dir * STEP_X, nextR = e.right + f.dir * STEP_X;
  if (nextL < L.WALL || nextR > L.W - L.WALL) {
    f.y += DROP_Y;
    f.dir = -f.dir;
  } else {
    f.x += f.dir * STEP_X;
  }
  w.fx.step(f.pose);
  const e2 = extent(w);
  if (e2 && e2.bottom >= L.FLOOR) { w.over = true; w.running = false; w.lives = 0; w.fx.hit(w.gun.x, L.GUN_Y); }
}

function grindBunkers(w) {
  const e = extent(w);
  if (!e || e.bottom < BUNKER_Y) return;
  const f = w.formation;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (!f.alive[r * COLS + c]) continue;
    const p = invPos(w, c, r);
    for (let dy = -INV_SIZE / 2; dy <= INV_SIZE / 2; dy += CELL) {
      for (let dx = -INV_SIZE / 2; dx <= INV_SIZE / 2; dx += CELL) {
        const hit = cellAt(w, p.x + dx, p.y + dy);
        if (hit) w.bunkers[hit[0]][hit[1]] = 0;
      }
    }
  }
}

/* The hit tests below are swept: they test the whole stretch the shot covered
   this step (y0 down to s.y), not only where it ended. A shot covers 37px in a
   30fps step and an invader's box is 34px tall, so a point test let shots pass
   clean through at a phone's worse moments — the render test caught it. */
const spans = (top, bottom, y1, y0) => bottom >= y1 && top <= y0;

function hitInvader(w, s, y0 = s.y) {
  const f = w.formation;
  for (let r = ROWS - 1; r >= 0; r--) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c;
    if (!f.alive[i]) continue;
    const p = invPos(w, c, r);
    if (Math.abs(s.x - p.x) <= INV_SIZE / 2 + 2 && spans(p.y - INV_SIZE / 2 - 4, p.y + INV_SIZE / 2 + 4, s.y, y0)) {
      f.alive[i] = false;
      w.shot = null;
      addScore(w, ROW_POINTS[r]);
      w.fx.kill(p.x, p.y, rowKind(r));
      return true;
    }
  }
  return false;
}

function hitSaucer(w, s, y0 = s.y) {
  const u = w.saucer;
  if (!u || Math.abs(s.x - u.x) > SAUCER_W / 2 + 2 || !spans(SAUCER_Y - 12, SAUCER_Y + 12, s.y, y0)) return false;
  addScore(w, u.points);
  w.fx.saucerKill(u.x, SAUCER_Y, u.points);
  w.saucer = null; w.shot = null;
  return true;
}

/** Shots and bombs that meet cancel out — the genre's one bit of defence in
 *  the air, and what makes standing under fire and shooting back a choice. */
function hitBomb(w, s, y0 = s.y, fall = 0) {
  for (let i = 0; i < w.bombs.length; i++) {
    const b = w.bombs[i];
    // the bomb is about to fall `fall` px this step too, so they close from both ends
    if (Math.abs(b.x - s.x) < 6 && spans(b.y - 14, b.y + fall + 14, s.y, y0)) {
      w.bombs.splice(i, 1); w.shot = null;
      w.fx.shield(s.x, s.y);
      return true;
    }
  }
  return false;
}

/** Drop a bomb from the bottom invader of the column `pick` lands on. The roll
 *  is mapped onto the columns still standing, so the number of rolls never
 *  depends on which columns the player has cleared. */
function dropBomb(w, pick, aimed) {
  const f = w.formation;
  const cols = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = ROWS - 1; r >= 0; r--) if (f.alive[r * COLS + c]) { cols.push([c, r]); break; }
  }
  if (!cols.length) return;
  let [c, r] = cols[Math.floor(pick * cols.length) % cols.length];
  if (aimed) {
    let bd = Infinity;
    for (const [cc, rr] of cols) {
      const d = Math.abs(invPos(w, cc, rr).x - w.gun.x);
      if (d < bd) { bd = d; c = cc; r = rr; }
    }
  }
  const p = invPos(w, c, r);
  w.bombs.push({ x: p.x, y: p.y + INV_SIZE / 2 });
}

function gunHit(w) {
  w.lives--;
  w.fx.hit(w.gun.x, w.L.GUN_Y);
  w.bombs = [];
  w.shot = null;
  if (w.lives <= 0) { w.over = true; w.running = false; return; }
  w.gun.dead = RESPAWN;
}

function addScore(w, n) {
  w.score += n;
  if (!w.extraGiven && w.score >= EXTRA_LIFE_AT) { w.extraGiven = true; w.lives++; w.fx.life(); }
}

function endWave(w) {
  w.wavesCleared = w.wave;
  w.waveClear = true;
  w.running = false;
  w.shot = null; w.bombs = [];
}

export function nextWave(w) {
  if (!w.waveClear) return false;
  w.wave++;
  startWave(w);
  return true;
}

export function resetGame(w) {
  w.over = false; w.running = false;
  w.wave = 1; w.score = 0; w.lives = START_LIVES; w.wavesCleared = 0; w.extraGiven = false;
  w.gun = { x: w.L.W / 2, dead: 0 };
  startWave(w);
}

/* ---------- saving a run in progress ---------- */

/** A JSON-safe picture of a run, seed included, so a resumed run drops the
 *  bombs it would have. Bunkers are packed as strings of 0/1. */
export function snapshot(w) {
  const f = w.formation;
  return {
    seed: w.seed, wave: w.wave, score: w.score, lives: w.lives,
    wavesCleared: w.wavesCleared, extraGiven: w.extraGiven,
    over: w.over, waveClear: w.waveClear,
    gun: { ...w.gun },
    shot: w.shot ? { ...w.shot } : null,
    bombs: w.bombs.map(b => ({ ...b })),
    saucer: w.saucer ? { ...w.saucer } : null,
    saucerT: w.saucerT, bombT: w.bombT,
    formation: { x: f.x, y: f.y, dir: f.dir, t: f.t, pose: f.pose, alive: f.alive.map(a => (a ? 1 : 0)).join('') },
    bunkers: w.bunkers.map(b => b.join('')),
  };
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);

export function hydrate(w, s) {
  if (!s || typeof s !== 'object') return false;
  if (!num(s.wave) || s.wave < 1 || !num(s.score) || !num(s.seed) || !num(s.lives)) return false;
  const f = s.formation;
  if (!f || !num(f.x) || !num(f.y) || typeof f.alive !== 'string' || f.alive.length !== COLS * ROWS) return false;
  if (!Array.isArray(s.bunkers) || s.bunkers.length !== BUNKERS) return false;
  if (s.bunkers.some(b => typeof b !== 'string' || b.length !== BUNKER_COLS * BUNKER_ROWS)) return false;
  if (!Array.isArray(s.bombs)) return false;

  w.seed = s.seed & 0x7fffffff;
  w.wave = Math.floor(s.wave); w.score = s.score; w.lives = s.lives;
  w.wavesCleared = num(s.wavesCleared) ? s.wavesCleared : w.wave - 1;
  w.extraGiven = !!s.extraGiven;
  w.over = !!s.over; w.waveClear = !!s.waveClear;
  w.gun = { x: num(s.gun?.x) ? s.gun.x : w.L.W / 2, dead: num(s.gun?.dead) ? s.gun.dead : 0 };
  w.shot = s.shot && num(s.shot.x) ? { x: s.shot.x, y: s.shot.y } : null;
  w.bombs = s.bombs.filter(b => num(b.x) && num(b.y)).map(b => ({ x: b.x, y: b.y }));
  w.saucer = s.saucer && num(s.saucer.x) ? { ...s.saucer } : null;
  w.saucerT = num(s.saucerT) ? s.saucerT : 16;
  w.bombT = num(s.bombT) ? s.bombT : 1;
  w.formation = { x: f.x, y: f.y, dir: f.dir === -1 ? -1 : 1, t: num(f.t) ? f.t : 0, pose: f.pose ? 1 : 0,
    alive: [...f.alive].map(ch => ch === '1') };
  w.bunkers = s.bunkers.map(b => [...b].map(ch => (ch === '1' ? 1 : 0)));
  w.running = false;
  return true;
}
