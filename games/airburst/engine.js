/* Airburst — pure logic core.
   Warheads fall on six cities; three batteries answer with interceptors that
   detonate where you tap, and the blast does the work. No DOM, no canvas, no
   timers. The only randomness is a seeded LCG (`rand`), so a seed replays a run
   exactly. The HTML shell owns rendering, input and the frame loop.

   Division of labour is Hull Breach's, not Flak Battery's: `step(w, dt)` reads
   no input. The shell calls `fire(w, x, y)` when the player taps, the same way
   Hull Breach's shell calls `launch`. */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- board ---------- */

/** One board, portrait (every game is, DECISIONS 2026-10-14). The sky is the
 *  play area; the ground strip at the bottom holds the cities and batteries,
 *  and is where a finger can rest without covering anything that moves. */
export const LAYOUT = {
  W: 600, H: 1100,
  GROUND_Y: 990,            // the surface: cities and batteries stand on it
  /** No interceptor is aimed below this — a burst on the ground would only
   *  ever hit what it is protecting. */
  get FIRE_FLOOR() { return this.GROUND_Y - 40; },
};

/** Batteries, left / centre / right, as fractions of the board width. */
export const BASE_X = [0.1, 0.5, 0.9];
/** Six cities, three between each pair of batteries. */
export const CITY_X = [0.2, 0.29, 0.38, 0.62, 0.71, 0.8];

/* ---------- tuning ---------- */

/** Interceptors each battery holds at the start of a wave. Three batteries, so
 *  a wave starts with three times this. */
export const BASE_AMMO = 10;
/** Interceptor flight speed, px/s. Fast enough that the lead you give a
 *  warhead is small, slow enough that you have to give one. */
export const INT_SPEED = 820;

/** A burst grows to its full radius, holds, then fades. A warhead touching the
 *  current radius at any moment is destroyed. */
export const BLAST_R = 48;
export const BLAST_GROW = 0.3;
export const BLAST_HOLD = 0.3;
export const BLAST_FADE = 0.4;
export const BLAST_LIFE = BLAST_GROW + BLAST_HOLD + BLAST_FADE;

/** Warheads in a wave. */
export const waveCount = (wave) => Math.min(8 + wave * 2, 40);
/** Warhead fall speed, px/s along its line. */
export const warheadSpeed = (wave) => Math.min(62 * (1 + (wave - 1) * 0.09), 240);
/** Seconds between warheads being released. */
export const spawnGap = (wave) => Math.max(0.45, 2.1 - wave * 0.12);
/** Score per warhead, rising every second wave. */
export const scoreMult = (wave) => Math.min(6, 1 + Math.floor((wave - 1) / 2));
export const WARHEAD_SCORE = 25;
/** End-of-wave bonus per unspent interceptor and per standing city. */
export const AMMO_BONUS = 5;
export const CITY_BONUS = 100;
/** Every this many points earns a city back at the end of a wave. */
export const BONUS_CITY_EVERY = 10000;

/** Splitting warheads arrive at wave 4. `splitChance` is per warhead released;
 *  a split happens at a height picked when it is released. */
export const SPLIT_WAVE = 4;
export const splitChance = (wave) => (wave < SPLIT_WAVE ? 0 : Math.min(0.35, 0.07 * (wave - SPLIT_WAVE + 1)));
export const splitInto = (wave) => (wave < 8 ? 2 : 3);
/** How far above its split height a splitting warhead starts to warn, px. At
 *  wave-4 speeds that is a little over a second — time to see it and burst it
 *  high, which is the answer to a split. */
export const SPLIT_WARN = 90;

/** 0 for a warhead that will not split (or is not close), rising to 1 at the
 *  moment it splits. The shell draws the warning from this. */
export function splitSoon(h) {
  if (h.splitAt === null || h.splitAt === undefined) return 0;
  const left = h.splitAt - h.y;
  if (left >= SPLIT_WARN) return 0;
  return clamp(1 - left / SPLIT_WARN, 0, 1);
}

/* ---------- randomness ---------- */

/** The same LCG Flak Battery and Feedline use, advanced on the world so a run
 *  replays from its seed. */
export function rand(w) {
  w.seed = (Math.imul(w.seed, 1103515245) + 12345) & 0x7fffffff;
  return w.seed / 0x80000000;
}

/* ---------- world ---------- */

const noFx = { launch() {}, burst() {}, kill() {}, cityLost() {}, baseLost() {}, empty() {}, split() {} };

function makeBases(L) {
  return BASE_X.map(f => ({ x: f * L.W, ammo: BASE_AMMO, alive: true }));
}

export function createWorld(opts = {}) {
  const L = opts.layout || LAYOUT;
  const w = {
    L,
    seed: (opts.seed ?? 20261014) & 0x7fffffff,
    fx: { ...noFx, ...(opts.fx || {}) },
    running: false, over: false,
    waveClear: false,
    wave: 1, score: 0, wavesCleared: 0,
    nextBonusCity: BONUS_CITY_EVERY,
    lastBonus: null,
    cities: CITY_X.map(f => ({ x: f * L.W, alive: true })),
    bases: makeBases(L),
    warheads: [], interceptors: [], blasts: [],
    toSpawn: 0, spawnT: 0,
  };
  startWave(w);
  return w;
}

/** Put the current wave's warheads in the queue. The first arrives promptly. */
function startWave(w) {
  w.toSpawn = waveCount(w.wave);
  w.spawnT = 0.8;
  w.waveClear = false;
  w.lastBonus = null;
}

export const citiesLeft = (w) => w.cities.filter(c => c.alive).length;
export const ammoLeft = (w) => w.bases.reduce((n, b) => n + (b.alive ? b.ammo : 0), 0);

/* ---------- firing ---------- */

/** The battery that answers a tap at x: the nearest one still standing with
 *  ammunition. Nearest, so the shortest flight — the player aims, the game
 *  picks the gun. */
export function baseFor(w, x) {
  let best = -1, bd = Infinity;
  w.bases.forEach((b, i) => {
    if (!b.alive || b.ammo <= 0) return;
    const d = Math.abs(b.x - x);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

/** Fire an interceptor at a point in the sky. Returns false (and fires
 *  nothing) if the run is not live, the point is off the sky, or every battery
 *  is spent. */
export function fire(w, x, y) {
  if (!w.running || w.over || w.waveClear) return false;
  if (!(x >= 0 && x <= w.L.W && y >= 0 && y <= w.L.FIRE_FLOOR)) return false;
  const i = baseFor(w, x);
  if (i < 0) { w.fx.empty(); return false; }
  const b = w.bases[i];
  b.ammo--;
  const sx = b.x, sy = w.L.GROUND_Y - 14;
  const dist = Math.hypot(x - sx, y - sy);
  w.interceptors.push({ sx, sy, x: sx, y: sy, tx: x, ty: y, t: 0, dur: dist / INT_SPEED, base: i });
  w.fx.launch(sx, sy);
  return true;
}

/* ---------- warheads ---------- */

/** Every surface target still standing: cities, and batteries (a battery hit
 *  loses its remaining ammunition until the next wave). */
function targets(w) {
  const out = [];
  w.cities.forEach((c, i) => { if (c.alive) out.push({ kind: 'city', i, x: c.x }); });
  w.bases.forEach((b, i) => { if (b.alive) out.push({ kind: 'base', i, x: b.x }); });
  return out;
}

/** A target from a roll in [0, 1) taken earlier — no LCG advance here. */
function targetFrom(w, roll) {
  const all = targets(w);
  if (!all.length) return null;
  return all[Math.floor(roll * all.length) % all.length];
}

function pickTarget(w) {
  return targetFrom(w, rand(w));
}

/** The most a warhead can split into, and so how many target rolls each one
 *  takes when it is released. */
const MAX_SPLIT = 3;

function makeWarhead(w, x0, y0, target) {
  const tx = target.x, ty = w.L.GROUND_Y;
  const len = Math.hypot(tx - x0, ty - y0);
  return {
    x0, y0, x: x0, y: y0, tx, ty, len, d: 0,
    speed: warheadSpeed(w.wave),
    target: { kind: target.kind, i: target.i },
    splitAt: null,
  };
}

function releaseWarhead(w) {
  const target = pickTarget(w);
  if (!target) return;
  const x0 = (0.05 + rand(w) * 0.9) * w.L.W;
  const h = makeWarhead(w, x0, -10, target);
  /* Every roll a split could ever need is taken *now*, for every warhead,
     whether it splits or not: whether, where, and a target for each child.
     The number of LCG advances must not depend on what happens later — or
     shooting a warhead before it splits (so its children never pick targets)
     would change every warhead released after it, and a seed would replay
     only for a player who did exactly the same things. Flak Battery's
     `rollDrop` exists for the same reason. */
  const roll = rand(w), height = rand(w);
  h.kidRolls = Array.from({ length: MAX_SPLIT }, () => rand(w));
  if (roll < splitChance(w.wave)) h.splitAt = (0.28 + height * 0.2) * w.L.GROUND_Y;
  w.warheads.push(h);
}

function splitWarhead(w, h) {
  const n = Math.min(splitInto(w.wave), MAX_SPLIT);
  const rolls = h.kidRolls || [];
  const kids = [];
  for (let k = 0; k < n; k++) {
    // a staged warhead with no rolls (tests, old saves) spreads its children
    // evenly rather than drawing new numbers
    const t = targetFrom(w, rolls[k] ?? (k + 0.5) / n);
    if (t) kids.push(makeWarhead(w, h.x, h.y, t));
  }
  return kids;
}

function strike(w, h) {
  const t = h.target;
  if (t.kind === 'city') {
    const c = w.cities[t.i];
    if (c.alive) { c.alive = false; w.fx.cityLost(c.x, w.L.GROUND_Y); }
  } else {
    const b = w.bases[t.i];
    if (b.alive) { b.alive = false; b.ammo = 0; w.fx.baseLost(b.x, w.L.GROUND_Y); }
  }
}

/* ---------- blasts ---------- */

/** A burst's radius at age t: grow, hold, fade. */
export function blastRadius(t) {
  if (t < BLAST_GROW) return BLAST_R * (t / BLAST_GROW);
  if (t < BLAST_GROW + BLAST_HOLD) return BLAST_R;
  if (t < BLAST_LIFE) return BLAST_R * (1 - (t - BLAST_GROW - BLAST_HOLD) / BLAST_FADE);
  return 0;
}

/* ---------- step ---------- */

export function step(w, dt) {
  if (!w.running || w.over || w.waveClear) return;

  // release
  if (w.toSpawn > 0) {
    w.spawnT -= dt;
    while (w.spawnT <= 0 && w.toSpawn > 0) {
      releaseWarhead(w);
      w.toSpawn--;
      w.spawnT += spawnGap(w.wave);
    }
  }

  // interceptors fly, and burst on arrival
  for (let i = w.interceptors.length - 1; i >= 0; i--) {
    const m = w.interceptors[i];
    m.t += dt;
    const k = m.dur > 0 ? Math.min(1, m.t / m.dur) : 1;
    m.x = m.sx + (m.tx - m.sx) * k;
    m.y = m.sy + (m.ty - m.sy) * k;
    if (k >= 1) {
      w.interceptors.splice(i, 1);
      w.blasts.push({ x: m.tx, y: m.ty, t: 0 });
      w.fx.burst(m.tx, m.ty);
    }
  }

  // blasts age
  for (let i = w.blasts.length - 1; i >= 0; i--) {
    w.blasts[i].t += dt;
    if (w.blasts[i].t >= BLAST_LIFE) w.blasts.splice(i, 1);
  }

  // warheads fall, split, are caught, or strike
  const born = [];
  for (let i = w.warheads.length - 1; i >= 0; i--) {
    const h = w.warheads[i];
    h.d += h.speed * dt;
    const k = Math.min(1, h.d / h.len);
    h.x = h.x0 + (h.tx - h.x0) * k;
    h.y = h.y0 + (h.ty - h.y0) * k;

    let caught = false;
    for (const b of w.blasts) {
      if (Math.hypot(h.x - b.x, h.y - b.y) <= blastRadius(b.t)) { caught = true; break; }
    }
    if (caught) {
      w.warheads.splice(i, 1);
      w.score += WARHEAD_SCORE * scoreMult(w.wave);
      w.fx.kill(h.x, h.y);
      continue;
    }
    if (h.splitAt !== null && h.y >= h.splitAt) {
      w.warheads.splice(i, 1);
      born.push(...splitWarhead(w, h));
      w.fx.split(h.x, h.y);
      continue;
    }
    if (k >= 1) {
      w.warheads.splice(i, 1);
      strike(w, h);
    }
  }
  w.warheads.push(...born);

  if (citiesLeft(w) === 0) { w.over = true; w.running = false; return; }

  if (w.toSpawn === 0 && !w.warheads.length && !w.interceptors.length && !w.blasts.length) {
    endWave(w);
  }
}

/** Score the wave and stop. `nextWave` starts the next one; the shell sits a
 *  banner between them, which is also where a run is saved. */
function endWave(w) {
  const ammo = ammoLeft(w), cities = citiesLeft(w);
  const mult = scoreMult(w.wave);
  const total = (ammo * AMMO_BONUS + cities * CITY_BONUS) * mult;
  w.score += total;
  w.lastBonus = { ammo, cities, mult, total, city: false };
  // earned cities come back at the wave's end, one per threshold crossed
  while (w.score >= w.nextBonusCity) {
    w.nextBonusCity += BONUS_CITY_EVERY;
    const lost = w.cities.find(c => !c.alive);
    if (lost) { lost.alive = true; w.lastBonus.city = true; }
  }
  w.wavesCleared = w.wave;
  w.waveClear = true;
  w.running = false;
}

export function nextWave(w) {
  if (!w.waveClear) return false;
  w.wave++;
  w.bases = makeBases(w.L);
  w.warheads = []; w.interceptors = []; w.blasts = [];
  startWave(w);
  return true;
}

export function resetGame(w) {
  w.over = false; w.running = false;
  w.wave = 1; w.score = 0; w.wavesCleared = 0;
  w.nextBonusCity = BONUS_CITY_EVERY;
  w.cities = CITY_X.map(f => ({ x: f * w.L.W, alive: true }));
  w.bases = makeBases(w.L);
  w.warheads = []; w.interceptors = []; w.blasts = [];
  startWave(w);
}

/* ---------- saving a run in progress ---------- */

/** A JSON-safe picture of a run. Everything in flight is kept — warheads,
 *  interceptors and blasts are plain numbers — and so is the seed, so a resumed
 *  run releases the warheads it would have. */
export function snapshot(w) {
  return {
    seed: w.seed, wave: w.wave, score: w.score, wavesCleared: w.wavesCleared,
    nextBonusCity: w.nextBonusCity, over: w.over, waveClear: w.waveClear,
    lastBonus: w.lastBonus ? { ...w.lastBonus } : null,
    cities: w.cities.map(c => c.alive),
    bases: w.bases.map(b => ({ ammo: b.ammo, alive: b.alive })),
    warheads: w.warheads.map(h => ({ ...h, target: { ...h.target }, kidRolls: h.kidRolls ? [...h.kidRolls] : undefined })),
    interceptors: w.interceptors.map(m => ({ ...m })),
    blasts: w.blasts.map(b => ({ ...b })),
    toSpawn: w.toSpawn, spawnT: w.spawnT,
  };
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Restore a snapshot in place. Returns false and changes nothing if it is not
 *  one this build can read. */
export function hydrate(w, s) {
  if (!s || typeof s !== 'object') return false;
  if (!num(s.wave) || s.wave < 1 || !num(s.score) || !num(s.seed)) return false;
  if (!Array.isArray(s.cities) || s.cities.length !== CITY_X.length) return false;
  if (!Array.isArray(s.bases) || s.bases.length !== BASE_X.length) return false;
  for (const k of ['warheads', 'interceptors', 'blasts']) if (!Array.isArray(s[k])) return false;
  if (s.warheads.some(h => !num(h.x) || !num(h.len) || !h.target)) return false;

  w.seed = s.seed & 0x7fffffff;
  w.wave = Math.floor(s.wave); w.score = s.score;
  w.wavesCleared = num(s.wavesCleared) ? s.wavesCleared : w.wave - 1;
  w.nextBonusCity = num(s.nextBonusCity) ? s.nextBonusCity : BONUS_CITY_EVERY;
  w.over = !!s.over; w.waveClear = !!s.waveClear;
  w.lastBonus = s.lastBonus || null;
  w.cities = CITY_X.map((f, i) => ({ x: f * w.L.W, alive: !!s.cities[i] }));
  w.bases = BASE_X.map((f, i) => ({
    x: f * w.L.W, alive: !!s.bases[i].alive, ammo: Math.max(0, Math.floor(s.bases[i].ammo) || 0),
  }));
  w.warheads = s.warheads.map(h => ({ ...h, target: { ...h.target }, kidRolls: Array.isArray(h.kidRolls) ? [...h.kidRolls] : undefined }));
  w.interceptors = s.interceptors.map(m => ({ ...m }));
  w.blasts = s.blasts.map(b => ({ ...b }));
  w.toSpawn = Math.max(0, Math.floor(s.toSpawn) || 0);
  w.spawnT = num(s.spawnT) ? s.spawnT : 0.8;
  w.running = false;
  return true;
}
