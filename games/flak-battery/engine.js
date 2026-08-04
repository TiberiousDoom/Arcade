/* Flak Battery — pure logic core.
   No DOM, no canvas, no timers. Everything here is deterministic and testable. */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- geometry ---------- */

export const LAYOUT = {
  W: 880, H: 620,
  MARGIN: 64, ROW_TOP: 70, ROW_GAP: 62, ROWS: 7,
  THUMB: 0,
  get FLOOR() { return this.H - 96 - this.THUMB; },
  get CANNON_Y() { return this.H - 44 - this.THUMB; },
};

/** Portrait phones get the same 7-row board plus an empty band at the bottom.
 *  The band is a thumb rest — somewhere to hold and drag that is below the
 *  cannon, so your hand never covers the play area. The board itself is
 *  unchanged, so difficulty and pacing carry over exactly. */
export const LAYOUT_TALL = {
  // 600x1150 (~1:1.9), narrow and tall so it fills a phone — the first attempt
  // at 880x800 was nearly square and left a third of the screen empty.
  //
  // ROWS must match LAYOUT's. The path serpentines, so odd rows run right-to-
  // left and even rows left-to-right; with a different row count, a segment at
  // the same fraction of the path lands in a row of the opposite direction and
  // the whole map appears to flip when the phone is turned. Matching the row
  // count keeps the two paths the same shape, just scaled. Rows are spaced
  // further apart here instead, which is what uses up the extra height.
  W: 600, H: 1150,
  MARGIN: 44, ROW_TOP: 84, ROW_GAP: 104, ROWS: 7,
  THUMB: 210,
  get FLOOR() { return this.H - 96 - this.THUMB; },
  get CANNON_Y() { return this.H - 44 - this.THUMB; },
};

export function buildPath(L = LAYOUT) {
  const pts = [];
  let lastX = L.MARGIN;
  for (let r = 0; r < L.ROWS; r++) {
    const y = L.ROW_TOP + r * L.ROW_GAP;
    const l = L.MARGIN, rt = L.W - L.MARGIN;
    if (r % 2 === 0) { pts.push({ x: l, y }); pts.push({ x: rt, y }); lastX = rt; }
    else { pts.push({ x: rt, y }); pts.push({ x: l, y }); lastX = l; }
  }
  // Final descent: the serpentine rows stop above the breach line, so without
  // this the snake could traverse the whole path and never actually breach.
  pts.push({ x: lastX, y: L.FLOOR + 30 });
  const path = [{ x: pts[0].x, y: pts[0].y, s: 0 }];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    acc += Math.hypot(b.x - a.x, b.y - a.y);
    path.push({ x: b.x, y: b.y, s: acc });
  }
  return { path, pathLen: acc };
}

/** Position at arc-length s. Points before the start or past the end are
 *  flagged `off` so callers can skip them rather than clamping silently. */
export function atS(path, pathLen, s) {
  if (s <= 0) return { x: path[0].x, y: path[0].y, off: true };
  if (s >= pathLen) {
    const e = path[path.length - 1];
    return { x: e.x, y: e.y, off: true };
  }
  let lo = 0, hi = path.length - 1;
  while (lo < hi - 1) {
    const m = (lo + hi) >> 1;
    if (path[m].s <= s) lo = m; else hi = m;
  }
  const a = path[lo], b = path[hi];
  const t = (s - a.s) / (b.s - a.s);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, off: false };
}

/* ---------- segments ---------- */

// Scrap trimmed ~25-30% across the board: at the old rates a run could afford
// all 5 gun mounts by wave 7, well before the upgrade tree gave it anything
// to weigh that against.
// Base hp raised across the board (feedback: a run reached wave 10+ with
// zero upgrades bought — the unaided difficulty was too soft independent of
// the shop). Carrier is left alone; it's a bonus pickup, not a threat.
// Scrap cut again on top of that (a run could max the whole shop by wave 20
// even after the previous nerf) — longer waves already mean more kills, so
// per-kill income needed to come down to compensate.
export const KIND = {
  std:      { hp: 4, r: 13, col: '#3fae8f', ring: '#1d6f5b', score: 60,  scrap: 1 },
  armored:  { hp: 13, r: 15, col: '#7f8fa0', ring: '#4a5765', score: 150, scrap: 4 },
  volatile: { hp: 3, r: 13, col: '#e0503c', ring: '#7d2517', score: 110, scrap: 3 },
  // Plated on the leading face: shots from the front glance off, so you must
  // either come at it from the side via a wall bounce or clear a neighbour
  // first to expose the flank.
  shielded: { hp: 6, r: 14, col: '#4d7fb3', ring: '#2b4d70', score: 200, scrap: 5, shield: true },
  // Heals while it lives. Ignore it and it undoes your chip damage; it never
  // heals past its cap and never comes back once destroyed.
  regen:    { hp: 8, r: 13, col: '#8f5fb8', ring: '#573a70', score: 180, scrap: 4, regen: 1.1 },
  // Rare. Killing it splits the chain into two independent snakes instead of
  // paying recoil — a trap that doubles the threat, or a scoring gamble.
  splitter: { hp: 7, r: 15, col: '#d8763a', ring: '#8a4318', score: 260, scrap: 7, splits: true },
  // Drops a power-up on death. Worth breaking your rhythm for.
  carrier:  { hp: 3, r: 14, col: '#e8d5a0', ring: '#a08c50', score: 140, scrap: 4, carries: true },
  // Just plain tough — no special resistance of its own. The railgun is
  // simply the efficient tool against it (`railBonus`, checked in
  // `damageSeg`), the same way armored favours a heavy hitter without being
  // literally immune to anything else.
  hardened: { hp: 10, r: 14, col: '#5fc9d6', ring: '#2e6b73', score: 240, scrap: 8, railBonus: 1.8 },
  head:     { hp: 24, r: 17, col: '#c9a227', ring: '#8a6f19', score: 400, scrap: 11 },
};

/** Shots landing within this angle of a shielded segment's leading face are
 *  deflected. Roughly a 120° frontal arc. */
export const SHIELD_ARC = Math.PI / 3;

/** No more than this many independent chains at once, or late waves turn into
 *  unreadable confetti. */
export const MAX_CHAINS = 3;

/** A splitter this close to either end would leave a useless stub, so the
 *  placement rule keeps them away from the head and tail. */
export const SPLIT_MARGIN = 3;

/** The wave each segment kind first appears on. Wave 1 is deliberately nothing
 *  but `std` (plus the head): the modular placement rules below used to fire
 *  from the first wave, so wave 1 shipped armored, volatile, shielded, regen,
 *  carrier *and* a splitter all at once — which is why it read as a wall rather
 *  than an opening. Kinds now arrive one at a time so each can be learned.
 *
 *  Order is roughly "how much new thinking does this demand": carrier is a
 *  bonus, armored is just tougher, volatile teaches chain reactions, shielded
 *  forces flanking, regen punishes chip damage, splitter changes the board. */
export const KIND_UNLOCK = {
  std: 1, carrier: 2, armored: 3, volatile: 4, shielded: 5, regen: 7, splitter: 9, hardened: 11,
};

/** Kinds available on a given wave, in unlock order. Head is always present and
 *  is not a body kind, so it isn't listed. */
export function kindsForWave(wave) {
  return Object.keys(KIND_UNLOCK).filter(k => wave >= KIND_UNLOCK[k]);
}

export function kindForIndex(i, count = Infinity, wave = Infinity) {
  if (i === 0) return 'head';
  const has = (k) => wave >= KIND_UNLOCK[k];
  // splitters first: rare, and only where both halves would be worth having
  if (has('splitter') && i % 13 === 8 && i >= SPLIT_MARGIN && count - i > SPLIT_MARGIN) return 'splitter';
  if (has('armored') && i % 7 === 3) return 'armored';
  if (has('volatile') && i % 11 === 6) return 'volatile';
  if (has('shielded') && i % 9 === 5) return 'shielded';
  if (has('hardened') && i % 19 === 9) return 'hardened';
  if (has('regen') && i % 17 === 11) return 'regen';
  if (has('carrier') && i % 6 === 4) return 'carrier';
  return 'std';
}

/* ---------- difficulty scaling ---------- */

/** Per-segment hp multiplier for a wave. Until now `KIND` hp values were fixed
 *  constants and nothing scaled them, so late waves were only *longer and
 *  faster* — never tougher to chew through. Same shape as Choke Point's
 *  `hpScale`, and capped so a very long run doesn't turn every segment into a
 *  sponge that outlasts the wave timer. */
// Steepened twice now (0.14 → 0.20 → 0.26) and the ceiling raised alongside.
// The base `KIND` hp values below carry part of "more hits per square"; this
// carries the rest, and is what stops a deep run flattening out once the
// multiplier caps.
export const HP_PER_WAVE = 0.26;
export const HP_SCALE_MAX = 5.5;

export function hpScale(wave) {
  return Math.min(HP_SCALE_MAX, 1 + (wave - 1) * HP_PER_WAVE);
}

/** Arc-length between consecutive craft in a chain.
 *
 *  Raised from 30 so the craft can be drawn larger *and* still read as
 *  separate objects. At 30 the shell's plates (2.8× the segment radius, ~36px)
 *  were wider than the gap between them, so a chain merged into one
 *  continuous fence and you could not see individual craft at all — which
 *  defeats the whole "column of cubes" idea.
 *
 *  It trades against chain length: the portrait path is ~4374px, so the
 *  72-segment cap spans ~3276px, about 75% of the run. Raising either this or
 *  `waveCount`'s cap much further starts to put the tail on the board before
 *  the head reaches the floor. */
export const SEGMENT_SPACING = 42;

export function makeChain(count, speed, startS, spacing = SEGMENT_SPACING, wave = 1) {
  const segs = [];
  const scale = hpScale(wave);
  for (let i = 0; i < count; i++) {
    const k = kindForIndex(i, count, wave);
    const K = KIND[k];
    // scale maxhp too, or hp bars would read wrong and the hit-stop/shake
    // thresholds (which test maxhp) would stay stuck at wave-1 values
    const hp = Math.max(1, Math.round(K.hp * scale));
    segs.push({ id: nextSegId(), kind: k, hp, maxhp: hp, r: K.r, flash: 0, deflect: 0 });
  }
  return { segs, s: startS, speed, spacing, recoil: 0, split: false };
}

let _segId = 1;
export function nextSegId() { return _segId++; }

/** Push the id counter past `id`. Restoring a saved run brings back segments
 *  carrying ids minted in a previous session, and the counter has restarted at
 *  1 — without this, a freshly spawned segment could reuse a restored id, and
 *  `battery.lastHitAt` is keyed by exactly that, so the new segment would
 *  inherit a stranger's convergence timing. */
export function reserveSegIds(id) {
  if (Number.isFinite(id) && id >= _segId) _segId = Math.floor(id) + 1;
}

/** Segments in a wave. Raised repeatedly (+3/40 → +4/56 → +8/72 → +9/78) as
 *  each pass found the chain still not growing fast enough to feel like
 *  escalating danger.
 *
 *  **The cap is a geometry limit, not a taste one.** At `SEGMENT_SPACING` a
 *  78-craft chain spans 78 × 42 ≈ 3276px of the portrait path's ~4374px —
 *  about 75%. Push either number much higher and the tail is still entering
 *  the board while the head is at the floor, which makes recoil meaningless
 *  and eventually laps the chain onto itself. Raise `hpScale` instead when
 *  more difficulty is wanted; that has no geometric ceiling. */
export const waveCount = (wave) => Math.min(20 + wave * 9, 78);
/** Path length of the standard layout, used as the default reference. */
export const REF_PATH_LEN = buildPath(LAYOUT).pathLen;

/** Seconds an untouched wave takes to cross, regardless of board size.
 *  Speed is derived from path length so the tall portrait board plays at
 *  the same pace as the standard one. */
export const TRAVERSAL_S = (wave) => Math.max(18, 40 - wave * 1.9);

export function waveSpeed(wave, pathLength = REF_PATH_LEN) {
  return pathLength / TRAVERSAL_S(wave);
}


export function segPos(path, pathLen, ch, i) {
  return atS(path, pathLen, ch.s - i * ch.spacing);
}

/** Direction a segment is travelling, as a unit vector. Sampled from the path
 *  just behind and ahead so it stays correct through corners. */
export function segHeading(path, pathLen, ch, i) {
  const s = ch.s - i * ch.spacing;
  const a = atS(path, pathLen, Math.max(0.01, s - 4));
  const b = atS(path, pathLen, Math.min(pathLen - 0.01, s + 4));
  const dx = b.x - a.x, dy = b.y - a.y;
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

/** True if an incoming shot glances off a shielded segment's leading face.
 *  `vx,vy` is the shot's velocity; the plate faces the direction of travel. */
export function isDeflected(seg, heading, vx, vy) {
  if (!KIND[seg.kind].shield) return false;
  const m = Math.hypot(vx, vy) || 1;
  // shot direction vs the segment's facing: a head-on hit means the shot
  // travels opposite to the heading
  const dot = (-vx / m) * heading.x + (-vy / m) * heading.y;
  return dot > Math.cos(SHIELD_ARC);
}

/* ---------- recoil ---------- */

/** Time bought by cutting at index `headSide` in a chain that has
 *  `remaining` segments left afterward. Cuts nearer the head pay more.
 *  Softened from (0.5 + ratio*2.2): the blowback on a near-head cut was
 *  reading as too punishing a penalty rather than a manageable trade-off. */
export function recoilGain(spacing, headSide, remaining) {
  if (headSide <= 0 || remaining <= 0) return 0;
  return spacing * (0.35 + (headSide / remaining) * 1.3);
}

/* ---------- overdrive ---------- */

export const OD_TIERS = [
  { name: '—',        rate: 0.30, dmg: 1,   pierce: 0, col: '#3fae8f' },
  { name: 'Warm',     rate: 0.23, dmg: 1,   pierce: 0, col: '#8dbf4a' },
  { name: 'Hot',      rate: 0.17, dmg: 1.5, pierce: 0, col: '#c9a227' },
  { name: 'Critical', rate: 0.12, dmg: 2,   pierce: 1, col: '#e0503c' },
];
export const OD_NEED = [3, 7, 12];

export function tierForStreak(streak) {
  let t = 0;
  for (let i = 0; i < OD_NEED.length; i++) if (streak >= OD_NEED[i]) t = i + 1;
  return t;
}

export const AIM_MIN = -Math.PI + 0.28;
export const AIM_MAX = -0.28;
export const clampAim = (a) => clamp(a, AIM_MIN, AIM_MAX);

/* ---------- touch aiming ---------- */

/** Radians per CSS pixel of horizontal drag at the slow end of the curve.
 *  Raised from 0.0052 after real-device testing: the aim arc is ~2.58 rad, so
 *  the old value needed nearly 500px of drag — more than a phone is wide — to
 *  cross it, and small corrections felt like hard work. At this gain a
 *  comfortable ~100px thumb drag covers about 40% of the arc. */
export const AIM_FINE = 0.0105;
/** Multiplier applied at full speed, so a fast swipe crosses the arc. */
export const AIM_COARSE_MULT = 3.4;
/** Drag speed (px/s) at which the curve reaches full coarse gain. Lower means
 *  acceleration arrives sooner, which reads as a more responsive stick. */
export const AIM_RAMP = 420;

/** Pointer-accel curve: responsive from the first pixel, then accelerating.
 *  A purely quadratic ramp feels dead at low speed because the curve is flat
 *  near zero, so this blends a linear term in. */
export function aimGain(speedPxPerSec) {
  const t = clamp(Math.abs(speedPxPerSec) / AIM_RAMP, 0, 1);
  const shaped = 0.45 * t + 0.55 * t * t;
  return AIM_FINE * (1 + (AIM_COARSE_MULT - 1) * shaped);
}

/* ---------- input-dependent aim: assist and traverse ----------

   Device testing found opposite problems on the two inputs: too hard on a
   phone (level 1 unclearable), too easy with a mouse. That is not one badly
   tuned curve, it is two inputs with different ceilings — a cursor aims
   absolutely and instantly, a thumb aims relatively and always lags. So the
   two are corrected separately, and the shell picks which applies.

   TOUCH gets a wider effective hit radius: forgiveness where the input is
   imprecise, without touching the aim curve the drag already uses.

   MOUSE gets a traverse cap: the battery is a turret, and a turret swings at
   a finite rate. Sweeping the whole arc takes real time instead of being a
   free teleport, which is what made mouse play trivial. Touch is unaffected
   in practice — a thumb drag rarely commands more than this anyway.

   Both are single constants on purpose: these are the two dials to turn after
   a device playtest. */

/** Extra pixels of hit radius granted when aim assist is on (touch). */
export const AIM_ASSIST_R = 9;
/** Fastest the battery can swing, in radians per second. The aim arc is about
 *  2.58 rad, so this crosses it in a bit under half a second. */
export const TRAVERSE_MAX = 5.6;

/** Move `from` toward `to` by at most the traverse rate, and clamp to the arc.
 *  Pure — the shell owns where `to` came from. */
export function slewAim(from, to, dt) {
  const max = TRAVERSE_MAX * dt;
  const d = clamp(to - from, -max, max);
  return clampAim(from + d);
}

/** Convert a drag delta into an angle delta. `dt` guards against a huge
 *  jump when the browser coalesces events after a stall. */
export function aimDelta(dx, dt) {
  const speed = dt > 0 ? dx / dt : 0;
  return dx * aimGain(speed);
}

/** Held-button trim: ramps from fine to coarse the longer it is held, so the
 *  same control does both nudging and sweeping. */
export const TRIM_MIN = 0.55;
export const TRIM_MAX = 2.6;
export const TRIM_RAMP = 0.6;
export function trimRate(heldSeconds) {
  const t = clamp(heldSeconds / TRIM_RAMP, 0, 1);
  return TRIM_MIN + (TRIM_MAX - TRIM_MIN) * t * t;
}

/** A tap shorter than this always yields one shot, so quick taps never
 *  land inside a cooldown and feel dropped. */
export const TAP_MAX = 0.2;

export const HEAT_PER_SHOT = 0.09;
export const HEAT_COOL = 0.22;
export const HEAT_COOL_LOCKED = 0.8;
export const LOCK_TIME = 1.5;

/* ---------- upgrades ---------- */

/** Four branches, five tiers each. Costs escalate steeply enough that a run
 *  affords roughly 60% of the tree, so you commit to a build rather than
 *  maxing everything. */
export const UPGRADES = {
  barrel: {
    name: 'Barrel',
    blurb: 'Damage per shot, then projectile size',
    costs: [42, 91, 161, 259, 392],
    /* shotR's top end pulled in (was 3.2→6.0). The shell draws a filled arc
       at `r` plus two glowDots at `r` and `r/2`, so the on-screen bloom is
       roughly twice the number — at 6.0 a maxed shot was a blob big enough
       to hide what it was about to hit. Damage still climbs the same. */
    tiers: [
      { dmg: 1.0, shotR: 3.0 },
      { dmg: 1.3, shotR: 3.0 },
      { dmg: 1.6, shotR: 3.4 },
      { dmg: 2.0, shotR: 3.8 },
      { dmg: 2.5, shotR: 4.2 },
      { dmg: 3.1, shotR: 4.6 },
    ],
  },
  chamber: {
    name: 'Chamber',
    blurb: 'Heat capacity and cooling — holds Overdrive longer',
    costs: [39, 84, 151, 241, 367],
    tiers: [
      { heatPerShot: 1.00, cool: 1.00, lock: 1.00 },
      { heatPerShot: 0.90, cool: 1.15, lock: 0.92 },
      { heatPerShot: 0.81, cool: 1.32, lock: 0.84 },
      { heatPerShot: 0.72, cool: 1.52, lock: 0.76 },
      { heatPerShot: 0.64, cool: 1.75, lock: 0.68 },
      { heatPerShot: 0.56, cool: 2.00, lock: 0.60 },
    ],
  },
  optics: {
    name: 'Optics',
    blurb: 'Projectile speed, then a longer intercept read',
    costs: [45, 95, 168, 269, 406],
    tiers: [
      { shotSpeed: 520, predict: 1.6 },
      { shotSpeed: 585, predict: 1.8 },
      { shotSpeed: 650, predict: 2.0 },
      { shotSpeed: 720, predict: 2.3 },
      { shotSpeed: 800, predict: 2.6 },
      { shotSpeed: 890, predict: 3.0 },
    ],
  },
  munitions: {
    name: 'Munitions',
    blurb: 'Extra pierce and wall bounces',
    costs: [49, 104, 182, 291, 437],
    tiers: [
      { pierce: 0, bounces: 2 },
      { pierce: 0, bounces: 3 },
      { pierce: 1, bounces: 3 },
      { pierce: 1, bounces: 4 },
      { pierce: 2, bounces: 5 },
      { pierce: 2, bounces: 6 },
    ],
  },
};

export const BRANCHES = Object.keys(UPGRADES);
export const MAX_TIER = 5;

export function newUpgrades() {
  const u = {};
  for (const b of BRANCHES) u[b] = 0;
  return u;
}

/** Cost of the next tier in a branch, or null if it is already maxed. */
export function upgradeCost(upgrades, branch) {
  const t = upgrades[branch];
  if (t >= MAX_TIER) return null;
  return UPGRADES[branch].costs[t];
}

export function canAfford(w, branch) {
  const c = upgradeCost(w.upgrades, branch);
  return c !== null && w.scrap >= c;
}

/** Buy one tier. Returns true if the purchase went through. */
export function buyUpgrade(w, branch) {
  if (!BRANCHES.includes(branch)) return false;
  const cost = upgradeCost(w.upgrades, branch);
  if (cost === null || w.scrap < cost) return false;
  w.scrap -= cost;
  w.upgrades[branch]++;
  return true;
}

/** Resolved stats for the current tiers. Read this rather than the tables. */
export function stats(w) {
  const u = w.upgrades;
  return {
    ...UPGRADES.barrel.tiers[u.barrel],
    ...UPGRADES.chamber.tiers[u.chamber],
    ...UPGRADES.optics.tiers[u.optics],
    ...UPGRADES.munitions.tiers[u.munitions],
  };
}

/** Total scrap needed to max every branch — used to sanity-check that a run
 *  cannot buy the whole tree. */
export function fullTreeCost() {
  return BRANCHES.reduce((sum, b) => sum + UPGRADES[b].costs.reduce((a, c) => a + c, 0), 0);
}

/* ---------- world ---------- */

export function createWorld(opts = {}) {
  const L = { ...LAYOUT, ...(opts.layout || {}) };
  const { path, pathLen } = buildPath(L);
  const w = {
    L, path, pathLen,
    chains: [], shots: [], bits: [], floaters: [],
    wave: 1, score: 0, scrap: 0, lives: 3,
    upgrades: newUpgrades(),
    gunUnlocks: { auto: false, rail: false, mortar: false, ion: false },
    barrels: 1,
    pickups: [], effects: {}, shieldCharges: 0, dropSeed: 987654321,
    /* Whether carriers drop power-ups at all. Off by default: the owner
       wanted to see how the game plays without them, and that is a question
       about the *base* game, so the base game is the thing without them.
       Kept as a switch rather than deleting the machinery — the whole
       pickup/effect system is intact behind it, and the shell exposes it in
       the settings menu so it can be A/B'd on a phone without a redeploy. */
    drops: opts.drops ?? false,
    shake: 0, hitStop: 0,
    // extra hit radius, set by the shell from the input device (see
    // AIM_ASSIST_R). Zero for mouse and keyboard, which aim precisely.
    assistR: opts.assist ? AIM_ASSIST_R : 0,
    shopOpen: false,
    running: false, over: false,
    waveClear: false, clearTimer: 0,
    breaches: 0,
    fx: opts.fx || { burst() {}, push() {}, shot() {} },
    battery: makeBattery(L, 1),
  };
  // `cannon` remains as an alias to the battery for shared aim/streak/od, so
  // existing call sites keep working; per-gun state lives in battery.guns
  w.cannon = w.battery;
  w.cannon.x = L.W / 2;
  return w;
}

/** Move an in-progress run onto a different board, as when the phone is
 *  rotated. Essentially lossless: chains are positioned by arc-length along the
 *  path, so scaling `s` by the ratio of path lengths puts every segment at the
 *  same fraction of its journey on the new board. Wave, score, scrap, lives,
 *  upgrades and the whole battery carry over untouched.
 *
 *  Shots and falling pickups are dropped — they are in flight, and there is no
 *  honest place to put them on a board of another shape. */
export function relayout(w, L2) {
  const { path, pathLen } = buildPath(L2);
  const ratio = pathLen / w.pathLen;

  for (const ch of w.chains) {
    ch.s *= ratio;
    ch.speed = waveSpeed(w.wave, pathLen);
    ch.spacing *= ratio;
    ch.recoil *= ratio;
  }

  w.L = L2;
  w.path = path;
  w.pathLen = pathLen;
  w.shots = [];
  w.pickups = [];

  // the battery sits on the new floor line, keeping its aim and heat
  const b = w.battery;
  b.y = L2.CANNON_Y;
  for (let i = 0; i < b.guns.length; i++) b.guns[i].x = L2.W * MOUNT_X[i];
  w.cannon.x = L2.W / 2;
  return w;
}

export function spawnWave(w) {
  w.chains = [makeChain(waveCount(w.wave), waveSpeed(w.wave, w.pathLen), -30, SEGMENT_SPACING, w.wave)];
  w.shots = []; w.bits = []; w.floaters = [];
  w.pickups = [];
  w.waveClear = false;
}

/* ---------- saving a run in progress ---------- */

/** A JSON-safe picture of a run. `L`, `path`, `pathLen` and `fx` are injected
 *  or derived and so are rebuilt on the way back in; `assistR` is deliberately
 *  left out because it describes the *device* (touch vs mouse), not the run —
 *  restoring a phone save on a desktop must not carry the touch aim assist over.
 *  `drops` is excluded for the same reason: it is a setting the player chose,
 *  so a resumed run should honour the setting that is live now, not the one
 *  that happened to be set when the save was written.
 *
 *  `bits` and `floaters` are dropped too: they are decorative particles with a
 *  lifetime measured in tenths of a second, and nobody resumes a game to find
 *  their sparks intact. */
export function snapshot(w) {
  const b = w.battery;
  return {
    wave: w.wave, score: w.score, scrap: w.scrap, lives: w.lives,
    breaches: w.breaches,
    over: w.over, waveClear: w.waveClear, clearTimer: w.clearTimer,
    shopOpen: w.shopOpen,
    upgrades: { ...w.upgrades },
    gunUnlocks: { ...w.gunUnlocks },
    barrels: w.barrels,
    effects: { ...w.effects },
    shieldCharges: w.shieldCharges,
    dropSeed: w.dropSeed,
    chains: w.chains.map(ch => ({
      s: ch.s, speed: ch.speed, spacing: ch.spacing, recoil: ch.recoil, split: ch.split,
      segs: ch.segs.map(s => ({ id: s.id, kind: s.kind, hp: s.hp, maxhp: s.maxhp, r: s.r })),
    })),
    pickups: w.pickups.map(p => ({ ...p })),
    battery: {
      ang: b.ang, streak: b.streak, od: b.od, clock: b.clock,
      lastHitAt: { ...b.lastHitAt },
      guns: b.guns.map(g => ({ x: g.x, type: g.type, heat: g.heat, cool: g.cool, locked: g.locked })),
    },
  };
}

/** Restore a snapshot onto an existing world, in place. Returns false and
 *  changes nothing if the snapshot is unusable, so a corrupt save degrades to
 *  "start a new run" rather than to a broken one. */
export function hydrate(w, snap) {
  if (!snap || typeof snap !== 'object') return false;
  if (!Array.isArray(snap.chains) || !snap.battery || !Array.isArray(snap.battery.guns)) return false;
  if (typeof snap.wave !== 'number') return false;
  // a kind or gun type this build no longer has would break every lookup
  if (snap.chains.some(ch => !Array.isArray(ch.segs) || ch.segs.some(s => !KIND[s.kind]))) return false;
  if (snap.battery.guns.some(g => !GUN_TYPES[g.type])) return false;
  if (snap.chains.length > MAX_CHAINS) return false;

  w.wave = snap.wave; w.score = snap.score ?? 0; w.scrap = snap.scrap ?? 0;
  w.lives = snap.lives ?? 3;
  w.breaches = snap.breaches ?? 0;
  w.over = !!snap.over;
  w.waveClear = !!snap.waveClear; w.clearTimer = snap.clearTimer ?? 0;
  w.shopOpen = !!snap.shopOpen;
  w.upgrades = { ...newUpgrades(), ...(snap.upgrades || {}) };
  w.gunUnlocks = { auto: false, rail: false, mortar: false, ion: false, ...(snap.gunUnlocks || {}) };
  w.barrels = clamp(Math.floor(snap.barrels ?? 1), 1, MAX_BARRELS);
  w.effects = { ...(snap.effects || {}) };
  w.shieldCharges = snap.shieldCharges ?? 0;
  w.dropSeed = snap.dropSeed ?? 987654321;

  w.chains = snap.chains.map(ch => ({
    s: ch.s, speed: ch.speed, spacing: ch.spacing ?? SEGMENT_SPACING,
    recoil: ch.recoil ?? 0, split: !!ch.split,
    segs: ch.segs.map(s => ({ ...s, flash: 0, deflect: 0 })),
  }));
  // ids came from a previous session where the counter has since restarted
  for (const ch of w.chains) for (const s of ch.segs) reserveSegIds(s.id);

  w.pickups = (snap.pickups || []).map(p => ({ ...p }));
  // in-flight shots and decorative particles do not survive; they mean nothing
  // once the run has been away, and shots would resume mid-trajectory
  w.shots = []; w.bits = []; w.floaters = [];
  w.shake = 0; w.hitStop = 0;

  const sb = snap.battery;
  const b = makeBattery(w.L, 1);
  b.ang = clampAim(sb.ang ?? b.ang);
  b.streak = sb.streak ?? 0;
  b.od = sb.od ?? 0;
  b.clock = sb.clock ?? 0;
  b.lastHitAt = { ...(sb.lastHitAt || {}) };
  // mounts are positioned from the *current* layout, not the saved one, so a
  // run saved in one orientation restores correctly in another
  b.guns = sb.guns.slice(0, MAX_MOUNTS).map((g, i) => ({
    x: w.L.W * MOUNT_X[i], type: g.type, heat: g.heat ?? 0, cool: g.cool ?? 0, locked: g.locked ?? 0,
  }));
  w.battery = b;
  w.cannon = b;              // the alias every call site uses
  w.cannon.x = w.L.W / 2;
  return true;
}

export function resetRun(w) {
  w.wave = 1; w.score = 0; w.scrap = 0; w.lives = 3;
  w.over = false; w.breaches = 0;
  w.upgrades = newUpgrades();
  w.pickups = []; w.effects = {}; w.shieldCharges = 0; w.dropSeed = 987654321;
  w.shake = 0; w.hitStop = 0;
  w.shopOpen = false;
  w.gunUnlocks = { auto: false, rail: false, mortar: false, ion: false };
  w.barrels = 1;
  w.battery = makeBattery(w.L, 1);
  w.cannon = w.battery;
  w.cannon.x = w.L.W / 2;
  spawnWave(w);
}

/** Add a mount if there is room and scrap. New mounts start as standard guns. */
export function buyMount(w) {
  const n = w.battery.guns.length;
  if (n >= MAX_MOUNTS) return false;
  const cost = MOUNT_COST[n];
  if (w.scrap < cost) return false;
  w.scrap -= cost;
  w.battery.guns.push(makeGun(w.L.W * MOUNT_X[n], 'standard'));
  return true;
}

export function mountCost(w) {
  const n = w.battery.guns.length;
  return n >= MAX_MOUNTS ? null : MOUNT_COST[n];
}

/** A top-tier upgrade: every mount fires this many barrels per volley
 *  instead of one, all sharing that mount's own heat/cooldown. Battery-wide
 *  (like mount count), not per-gun — there is one dial, not five. */
export const MAX_BARRELS = 3;
export const BARREL_COST = [260, 460];   // cost of the 2nd and 3rd barrel

export function barrelCost(w) {
  return w.barrels >= MAX_BARRELS ? null : BARREL_COST[w.barrels - 1];
}

export function buyBarrel(w) {
  const cost = barrelCost(w);
  if (cost === null || w.scrap < cost) return false;
  w.scrap -= cost;
  w.barrels++;
  return true;
}

/** Unlock a gun type for assignment. One-time purchase. */
export function unlockGun(w, type) {
  const G = GUN_TYPES[type];
  if (!G || type === 'standard' || w.gunUnlocks[type]) return false;
  if (w.scrap < G.unlock) return false;
  w.scrap -= G.unlock;
  w.gunUnlocks[type] = true;
  return true;
}

/** Assign an unlocked type to a mount. */
export function setGunType(w, mountIndex, type) {
  const g = w.battery.guns[mountIndex];
  if (!g || !GUN_TYPES[type]) return false;
  if (type !== 'standard' && !w.gunUnlocks[type]) return false;
  g.type = type;
  return true;
}

/** The point the battery is aiming at: follow the shared aim vector out from
 *  centre to a fixed range. Every gun fires toward this point, so the spread
 *  converges there. */
export function aimPoint(w) {
  const b = w.battery;
  const range = 620;
  return {
    x: w.L.W / 2 + Math.cos(b.ang) * range,
    y: b.y + Math.sin(b.ang) * range,
  };
}

/** Fire one gun toward the aim point. Returns the primary shot or null if the
 *  gun could not fire (cooling or locked). */
function fireGun(w, gun) {
  if (gun.locked > 0 || gun.cool > 0) return null;
  const b = w.battery;
  const T = OD_TIERS[b.od];
  const S = stats(w);
  const G = GUN_TYPES[gun.type];

  const muzzleX = gun.x, muzzleY = b.y;
  const tp = aimPoint(w);
  const ang = Math.atan2(tp.y - muzzleY, tp.x - muzzleX);

  // A multi-barrel mount fires all its barrels in one volley, at a small
  // angular fan, sharing this one heat/cooldown pool — the natural balancing
  // lever for barrel count is that 3 barrels costs 3x the heat of 1, with no
  // new per-barrel state needed.
  gun.cool = T.rate * G.rate * (hasEffect(w, 'rapid') ? 0.55 : 1);
  gun.heat = clamp(gun.heat + HEAT_PER_SHOT * S.heatPerShot * w.barrels, 0, 1);
  if (gun.heat >= 1) {
    gun.locked = LOCK_TIME * S.lock; gun.heat = 1;
    // overheating one gun drops the shared streak, but not all the way — the
    // battery keeps firing on its other mounts
    b.streak = Math.max(0, b.streak - 4);
    b.od = tierForStreak(b.streak);
    w.fx.push('OVERHEAT', muzzleX, muzzleY - 60, '#e0503c');
  }

  const spd = S.shotSpeed * G.spd;
  const makeShot = (a) => ({
    x: muzzleX + Math.cos(a) * b.len,
    y: muzzleY + Math.sin(a) * b.len,
    vx: Math.cos(a) * spd,
    vy: Math.sin(a) * spd,
    dmg: T.dmg * S.dmg * G.dmg,
    pierce: T.pierce + S.pierce + G.pierce + (hasEffect(w, 'pierce') ? 2 : 0),
    bounces: S.bounces + (hasEffect(w, 'ricochet') ? 4 : 0),
    r: S.shotR,
    arc: G.arc ? true : false,
    gun: gun.type,      // which mount fired this — damageSeg/isDeflected check this
    // The colour to draw this shot, baked in at fire time rather than read
    // live off the battery every frame — a shot fired while cool must stay
    // the colour it was fired at, not flip to red mid-flight the instant the
    // battery's streak climbs into Critical after it launched. The ion
    // cannon keeps its own colour regardless of tier, same as it always has.
    col: gun.type === 'ion' ? G.col : T.col,
  });

  const offsets = BARREL_OFFSETS[w.barrels] ?? BARREL_OFFSETS[1];
  const shot = makeShot(ang + offsets[0]);
  w.shots.push(shot);
  for (let i = 1; i < offsets.length; i++) w.shots.push(makeShot(ang + offsets[i]));

  if (hasEffect(w, 'spread')) {
    for (const off of [-0.16, 0.16]) w.shots.push(makeShot(ang + off));
  }
  return shot;
}

/** Angular fan for a mount's barrels — one entry per barrel, fired in the
 *  same volley off the one heat/cooldown pool. */
const BARREL_OFFSETS = { 1: [0], 2: [-0.09, 0.09], 3: [-0.15, 0, 0.15] };

/** Fire the whole battery. Every ready gun looses a shot toward the shared
 *  aim point. Returns the number of guns that fired. */
export function fire(w) {
  let fired = 0;
  for (const gun of w.battery.guns) {
    if (fireGun(w, gun)) fired++;
  }
  // one hook per volley, so the shell can sound a single blip regardless of how
  // many barrels loosed. Optional, like every fx call — silence is the default.
  if (fired) w.fx.shot?.(fired);
  return fired;
}

export function registerHit(w) {
  const c = w.cannon;
  c.streak++;
  const t = tierForStreak(c.streak);
  if (t > c.od) {
    c.od = t;
    w.fx.push(OD_TIERS[t].name.toUpperCase(), c.x, c.y - 60, OD_TIERS[t].col);
  }
}

export function registerMiss(w) {
  const c = w.cannon;
  c.streak = 0;
  if (c.od > 0) c.od--;
}

/* ---------- battery ---------- */

/** Gun types you can assign to a mount once unlocked. `standard` is the
 *  starting gun; the others trade fire rate for a special property, so the
 *  four upgrade branches map onto guns you can physically see. */
export const GUN_TYPES = {
  standard: { name: 'Cannon',     rate: 1.0,  dmg: 1.0, pierce: 0, spd: 1.0,  col: '#c9a227', unlock: 0 },
  auto:     { name: 'Autocannon', rate: 0.5,  dmg: 0.6, pierce: 0, spd: 1.0,  col: '#8dbf4a', unlock: 120 },
  rail:     { name: 'Railgun',    rate: 1.9,  dmg: 2.4, pierce: 2, spd: 1.7,  col: '#6fb7e8', unlock: 160 },
  mortar:   { name: 'Mortar',     rate: 1.6,  dmg: 1.8, pierce: 0, spd: 0.75, col: '#e0503c', unlock: 200, arc: true },
  // The one gun `shielded` can't deflect — the collision loop checks the
  // shot's `gun` field for the literal string 'ion' before ever calling
  // isDeflected, not a stat on this table.
  ion:      { name: 'Ion Cannon', rate: 1.3,  dmg: 1.1, pierce: 0, spd: 1.3,  col: '#7fe0ff', unlock: 260 },
};
export const GUN_KEYS = Object.keys(GUN_TYPES);

/** Mount x-positions across the battery, as fractions of width. Index 0 is
 *  dead centre; more mounts fan outward symmetrically. */
export const MOUNT_X = [0.5, 0.32, 0.68, 0.18, 0.82];
export const MAX_MOUNTS = 5;
export const MOUNT_COST = [0, 130, 247, 416, 624];   // cost of the Nth mount

/** How close two hits must land in time to count as convergence. */
export const CONVERGE_WINDOW = 0.12;
export const CONVERGE_BONUS = 0.6;                  // extra damage fraction

export function makeGun(x, type = 'standard') {
  return { x, type, heat: 0, cool: 0, locked: 0 };
}

/** Build the battery for a given mount count. The shared aim, streak and
 *  overdrive live on the battery; heat and cooldown live per gun. */
export function makeBattery(L, mounts = 1, types = null) {
  const guns = [];
  for (let i = 0; i < mounts; i++) {
    guns.push(makeGun(L.W * MOUNT_X[i], types ? types[i] : 'standard'));
  }
  return {
    y: L.CANNON_Y, ang: -Math.PI / 2, len: 34,
    streak: 0, od: 0, queued: false,
    guns,
    // convergence bookkeeping: segment id -> last hit time
    lastHitAt: {}, clock: 0,
  };
}

/** Pickups fall from destroyed Carriers. You either shoot them or let them
 *  land in the catch zone above the cannon — both work, which makes the
 *  decision "is this worth breaking my aim for?" rather than a reflex. */
export const POWERUPS = {
  spread:  { name: 'Spread',  dur: 9,  col: '#5fc9a4', blurb: 'Three-shot fan' },
  rapid:   { name: 'Rapid',   dur: 8,  col: '#8dbf4a', blurb: 'Shorter cooldown' },
  pierce:  { name: 'Pierce',  dur: 10, col: '#c9a227', blurb: 'Shots punch through' },
  freeze:  { name: 'Freeze',  dur: 2.5, col: '#6fb7e8', blurb: 'The snake halts' },
  bomb:    { name: 'Bomb',    dur: 0,  col: '#e0503c', blurb: 'Radial blast on pickup' },
  ricochet:{ name: 'Ricochet',dur: 9,  col: '#b98de0', blurb: 'Extra wall bounces' },
  shield:  { name: 'Shield',  dur: 0,  col: '#e6e9e2', blurb: 'Absorbs one breach' },
};
export const POWERUP_KEYS = Object.keys(POWERUPS);

/** Deliberately not uniform: freeze and shield are the strong ones, so they
 *  come up less often than the situational effects. */
export const DROP_TABLE = [
  'spread', 'spread', 'rapid', 'rapid', 'pierce', 'pierce',
  'ricochet', 'bomb', 'bomb', 'freeze', 'shield',
];

export const PICKUP_FALL = 95;      // px/sec
export const PICKUP_R = 11;
export const BOMB_RADIUS = 110;
export const BOMB_DMG = 4;
/** Band above the cannon where a falling pickup is caught automatically. */
export const CATCH_BAND = 46;

/** Deterministic drop choice, seeded off the world's drop counter so runs are
 *  reproducible in tests but varied in play. */
export function rollDrop(w) {
  const n = (w.dropSeed = (w.dropSeed * 1103515245 + 12345) & 0x7fffffff);
  return DROP_TABLE[n % DROP_TABLE.length];
}

export function spawnPickup(w, x, y, kind) {
  w.pickups.push({ x, y, kind, vy: PICKUP_FALL, r: PICKUP_R, life: 14 });
}

/** Apply a power-up. Timed effects stack duration rather than refreshing, so
 *  collecting two of the same is meaningfully better than one. */
export function applyPowerup(w, kind) {
  const P = POWERUPS[kind];
  if (!P) return false;

  if (kind === 'bomb') {
    // blast centred on the pickup's own position, not the cannon, so it
    // clears what was actually in front of you
    const bx = w.bombAt ? w.bombAt.x : w.cannon.x;
    const by = w.bombAt ? w.bombAt.y : w.cannon.y;
    let killed = 0;
    for (let ci = w.chains.length - 1; ci >= 0; ci--) {
      const ch = w.chains[ci];
      if (!ch) continue;
      for (let i = ch.segs.length - 1; i >= 0; i--) {
        const p = segPos(w.path, w.pathLen, ch, i);
        if (p.off) continue;
        if (Math.hypot(p.x - bx, p.y - by) < BOMB_RADIUS) {
          if (damageSeg(w, ci, i, BOMB_DMG)) killed++;
        }
      }
    }
    w.fx.burst(bx, by, P.col, 40);
    w.fx.push('BOMB', bx, by, P.col);
    w.shake = Math.max(w.shake, 0.5);
    return true;
  }

  if (kind === 'shield') {
    w.shieldCharges++;
    w.fx.push('SHIELD', w.cannon.x, w.cannon.y - 70, P.col);
    return true;
  }

  w.effects[kind] = (w.effects[kind] || 0) + P.dur;
  w.fx.push(P.name.toUpperCase(), w.cannon.x, w.cannon.y - 70, P.col);
  return true;
}

export const hasEffect = (w, kind) => (w.effects[kind] || 0) > 0;

export function stepPickups(w, dt) {
  const c = w.cannon;
  for (let i = w.pickups.length - 1; i >= 0; i--) {
    const p = w.pickups[i];
    p.y += p.vy * dt;
    p.life -= dt;

    // caught in the band above the cannon
    const near = Math.hypot(p.x - c.x, p.y - c.y);
    if (near < CATCH_BAND + p.r) {
      w.bombAt = { x: p.x, y: p.y };
      applyPowerup(w, p.kind);
      w.bombAt = null;
      w.pickups.splice(i, 1);
      continue;
    }
    if (p.y > w.L.H + 30 || p.life <= 0) w.pickups.splice(i, 1);
  }

  // timed effects tick down
  for (const k of Object.keys(w.effects)) {
    if (w.effects[k] > 0) {
      w.effects[k] = Math.max(0, w.effects[k] - dt);
      if (w.effects[k] === 0) delete w.effects[k];
    }
  }
}

/** Split a chain at index `i`, which has just been removed. The head-side
 *  portion carries on; the tail-side portion grows its own head and becomes an
 *  independent snake. Returns true if the split happened. */
export function splitChain(w, ci, i) {
  const ch = w.chains[ci];
  if (!ch) return false;
  if (w.chains.length >= MAX_CHAINS) return false;
  if (ch.split) return false;                       // one split per chain
  const tail = ch.segs.slice(i);
  const front = ch.segs.slice(0, i);
  if (front.length < 2 || tail.length < 2) return false;

  // the tail's leading segment becomes a head, at head stats for this wave
  const H = KIND.head;
  const hhp = Math.max(1, Math.round(H.hp * hpScale(w.wave)));
  tail[0] = { id: nextSegId(), kind: 'head', hp: hhp, maxhp: hhp, r: H.r, flash: 0, deflect: 0 };

  ch.segs = front;
  ch.split = true;

  // the new chain starts where the tail already was, so nothing teleports
  w.chains.splice(ci + 1, 0, {
    segs: tail,
    s: ch.s - i * ch.spacing,
    speed: ch.speed,
    spacing: ch.spacing,
    recoil: 0,
    split: true,
  });
  return true;
}

/* ---------- the head ----------

   The head sits at index 0, which is the *leading* segment: the first thing to
   reach the floor and the closest target to the battery. So making a head kill
   destroy the whole chain, on its own, would have made the easiest shot on the
   board an instant win and left recoil, mid-chain cutting, splitters and
   shielded flanking pointless.

   Instead the body armours the head. Damage to it is divided by how much body
   is still alive, so clearing the chain first is the efficient route — but a
   rail shot or an overdrive burst can still attempt an early decapitation for
   a large payoff. That turns the head into a risk/reward decision rather than
   a shortcut, and killing it does end the whole snake. */

/** Fraction of normal damage the head takes with `bodyLeft` segments behind it.
 *  1 at full exposure, falling away steeply while the body is intact. */
export function headDamageFactor(bodyLeft) {
  return 1 / (1 + Math.max(0, bodyLeft));
}

/** Destroy a whole chain at once, paying out every segment still on it. Used
 *  when the head dies: the body dies with it, and it all scores. */
function decapitate(w, ci) {
  const ch = w.chains[ci];
  if (!ch) return false;
  let score = 0, scrap = 0;
  for (let j = 0; j < ch.segs.length; j++) {
    const s = ch.segs[j];
    const K = KIND[s.kind];
    score += K.score; scrap += K.scrap;
    const p = segPos(w.path, w.pathLen, ch, j);
    if (!p.off) w.fx.burst(p.x, p.y, K.col, 10);
  }
  const hp = segPos(w.path, w.pathLen, ch, 0);
  w.score += score;
  w.scrap += scrap;
  w.fx.push('COMMAND SHIP DOWN +' + score, hp.x, hp.y, KIND.head.col);
  w.hitStop = Math.max(w.hitStop, 0.12);
  w.shake = Math.max(w.shake, 0.6);
  w.chains.splice(ci, 1);
  return true;
}

/** Apply damage. Returns true if the segment died. `shot` is optional (the
 *  bomb call site has none) — only used to check `railBonus` against the
 *  gun that fired, everything else about damage is unaffected by it. */
export function damageSeg(w, ci, i, dmg, shot) {
  const ch = w.chains[ci];
  if (!ch) return false;
  const seg = ch.segs[i];
  if (!seg) return false;

  // the railgun is simply the efficient tool against a hardened hull — a
  // damage bonus, not a resistance any other gun lacks. Independent of the
  // head-shielding logic below and of `shielded`'s frontal deflection, which
  // the ion cannon bypasses entirely at the collision-loop call site instead.
  const K0 = KIND[seg.kind];
  if (K0.railBonus && shot?.gun === 'rail') dmg *= K0.railBonus;

  // the head is shielded by whatever body is still behind it
  if (seg.kind === 'head') {
    const bodyLeft = ch.segs.length - 1;
    if (bodyLeft > 0) {
      dmg *= headDamageFactor(bodyLeft);
      // reuse the shielded plates' flash field so the shell can show the hit
      // being absorbed — otherwise a shot on a protected head looks like a bug
      seg.deflect = 0.12;
    }
  }

  seg.hp -= dmg;
  seg.flash = 0.12;
  if (seg.hp > 0) return false;

  // a downed head takes the whole snake with it, body and all
  if (seg.kind === 'head') return decapitate(w, ci);

  const K = KIND[seg.kind];
  const pos = segPos(w.path, w.pathLen, ch, i);
  w.score += K.score;
  w.scrap += K.scrap;
  w.fx.burst(pos.x, pos.y, K.col, 14);
  w.fx.push('+' + K.score, pos.x, pos.y, K.col);

  // juice: bigger targets stop the world for longer
  w.hitStop = Math.max(w.hitStop, seg.maxhp >= 6 ? 0.055 : 0.028);
  w.shake = Math.max(w.shake, seg.maxhp >= 6 ? 0.32 : 0.16);

  if (seg.kind === 'volatile') {
    // splash scales with the wave alongside segment hp, or the chain reaction
    // would quietly stop mattering once segments carry 4x the health
    const splash = 3 * hpScale(w.wave);
    for (const j of [i - 1, i + 1]) {
      if (ch.segs[j]) { ch.segs[j].hp -= splash; ch.segs[j].flash = 0.12; }
    }
    w.fx.burst(pos.x, pos.y, '#e0503c', 26);
  }

  // `drops` off is an experiment — see createWorld. Everything downstream
  // (stepPickups, the catch band, the pickup rendering) is already gated on
  // `pickups.length`, so this one line is the whole switch.
  if (K.carries && w.drops) spawnPickup(w, pos.x, pos.y, rollDrop(w));

  ch.segs.splice(i, 1);
  ch._pos = null;   // stale after the splice — stepShots rebuilds it lazily

  /* A splitter pays no recoil — instead the chain comes apart and the tail
     grows its own head. That is the trade: you lose the time a normal cut
     would have bought, and gain a second snake. */
  if (K.splits && splitChain(w, ci, i)) {
    w.fx.push('SPLIT', pos.x, pos.y, K.col);
    w.fx.burst(pos.x, pos.y, K.col, 22);
  } else {
    ch.recoil += recoilGain(ch.spacing, i, ch.segs.length);
  }

  if (ch.segs.length === 0) w.chains.splice(ci, 1);
  return true;
}

/* ---------- simulation step ---------- */

export function stepChains(w, dt) {
  const frozen = hasEffect(w, 'freeze');
  for (const ch of w.chains) {
    if (frozen) {
      for (const s of ch.segs) {
        s.flash = Math.max(0, s.flash - dt);
        const K = KIND[s.kind];
        if (K.regen && s.hp < s.maxhp) s.hp = Math.min(s.maxhp, s.hp + K.regen * dt);
      }
      continue;
    }
    if (ch.recoil > 0) {
      const pay = Math.min(ch.recoil, ch.speed * 2.4 * dt);
      ch.recoil -= pay;
      ch.s -= pay;
    } else {
      ch.s += ch.speed * dt;
    }
    ch.s = Math.max(ch.s, -40);
    for (const s of ch.segs) {
      s.flash = Math.max(0, s.flash - dt);
      if (s.deflect > 0) s.deflect = Math.max(0, s.deflect - dt);
      const K = KIND[s.kind];
      // regenerators claw back damage, but never past their cap
      if (K.regen && s.hp < s.maxhp) s.hp = Math.min(s.maxhp, s.hp + K.regen * dt);
    }
  }
}

/** Request fire. Any ready gun shoots now; the request is remembered so guns
 *  still cooling loose the moment they clear. A tap never feels dropped. */
export function queueShot(w) {
  const b = w.battery;
  const anyReady = b.guns.some(g => g.locked <= 0 && g.cool <= 0);
  if (anyReady) { fire(w); b.queued = true; return true; }
  // nothing ready right now, but remember the intent
  b.queued = b.guns.some(g => g.locked <= 0);
  return false;
}

export function stepCannon(w, dt, firing) {
  const b = w.battery;
  const coolMult = stats(w).cool;
  for (const g of b.guns) {
    g.cool = Math.max(0, g.cool - dt);
    g.locked = Math.max(0, g.locked - dt);
    const rate = (g.locked > 0 ? HEAT_COOL_LOCKED : HEAT_COOL) * coolMult;
    g.heat = clamp(g.heat - rate * dt, 0, 1);
  }
  b.clock += dt;
  // expire stale convergence records
  for (const id of Object.keys(b.lastHitAt)) {
    if (b.clock - b.lastHitAt[id] > CONVERGE_WINDOW) delete b.lastHitAt[id];
  }

  if (firing) fire(w);
  else if (b.queued) {
    // drain the queue onto any gun that has come ready
    if (b.guns.some(g => g.locked <= 0 && g.cool <= 0)) fire(w);
    if (b.guns.every(g => g.cool > 0 || g.locked > 0)) b.queued = false;
  }
}

export function stepShots(w, dt) {
  const { W, H } = w.L;
  // Chains move every frame (stepChains runs before this), so last frame's
  // cached positions are stale even without a splice — every chain's cache
  // has to start the frame invalidated. Splices mid-frame (a death, or a
  // splitter's split) invalidate again below, since a chain can be hit more
  // than once in the same frame.
  for (const ch of w.chains) ch._pos = null;
  for (let k = w.shots.length - 1; k >= 0; k--) {
    const p = w.shots[k];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // walls reflect, but only for as many bounces as Munitions allows
    const maxB = p.bounces ?? 2;
    if (p.x < 6) {
      if ((p.bounced || 0) >= maxB) { w.shots.splice(k, 1); registerMiss(w); continue; }
      p.x = 6; p.vx *= -1; p.bounced = (p.bounced || 0) + 1;
    }
    if (p.x > W - 6) {
      if ((p.bounced || 0) >= maxB) { w.shots.splice(k, 1); registerMiss(w); continue; }
      p.x = W - 6; p.vx *= -1; p.bounced = (p.bounced || 0) + 1;
    }
    if (p.y < -20 || p.y > H + 20) { w.shots.splice(k, 1); registerMiss(w); continue; }

    // a shot can claim a pickup mid-air
    let claimed = false;
    for (let q = w.pickups.length - 1; q >= 0; q--) {
      const pu = w.pickups[q];
      if (Math.hypot(p.x - pu.x, p.y - pu.y) < pu.r + p.r) {
        w.bombAt = { x: pu.x, y: pu.y };
        applyPowerup(w, pu.kind);
        w.bombAt = null;
        w.pickups.splice(q, 1);
        w.shots.splice(k, 1);
        claimed = true;
        break;
      }
    }
    if (claimed) continue;

    let hit = false;
    outer:
    for (let ci = w.chains.length - 1; ci >= 0; ci--) {
      const ch = w.chains[ci];
      // Every shot checks every segment, and segPos does an O(log n) path
      // lookup — with 5 guns + spread stacking shots, that product was the
      // choppiness at high wave counts. Positions are cached per chain and
      // reused across shots within the frame; damageSeg invalidates the
      // cache whenever it splices ch.segs (a death, or a splitter's split),
      // so a stale index never survives past the mutation that caused it.
      if (!ch._pos) ch._pos = ch.segs.map((_, si) => segPos(w.path, w.pathLen, ch, si));
      for (let i = ch.segs.length - 1; i >= 0; i--) {
        const seg = ch.segs[i];
        const sp = ch._pos[i];
        if (sp.off) continue;
        if (Math.hypot(p.x - sp.x, p.y - sp.y) < seg.r + p.r + w.assistR) {
          const heading = segHeading(w.path, w.pathLen, ch, i);
          // the ion cannon bypasses shielded's frontal-arc deflection outright —
          // it hits from any angle, which is what makes it the answer for
          // shielded rather than just another gun a player has to flank with
          if (p.gun !== 'ion' && isDeflected(seg, heading, p.vx, p.vy)) {
            // glances off the plate: the shot bounces away and the streak
            // survives, since the player did make contact
            seg.deflect = 0.15;
            const m = Math.hypot(p.vx, p.vy) || 1;
            const nx = -heading.x, ny = -heading.y;
            const d = (p.vx * nx + p.vy * ny) / m;
            p.vx -= 2 * d * nx * m; p.vy -= 2 * d * ny * m;
            p.x = sp.x + nx * (seg.r + p.r + 1);
            p.y = sp.y + ny * (seg.r + p.r + 1);
            w.fx.burst(sp.x, sp.y, KIND.shielded.ring, 6);
            break outer;
          }
          registerHit(w);
          /* Convergence: if another shot struck this same segment within the
             window, both count as focused fire and hit harder. The bonus is
             silent now — it used to push a "FOCUS" floater, which with five
             guns firing fired on most kills and became noise rather than
             information. The bonus itself is unchanged. */
          const b = w.battery;
          let dmg = p.dmg;
          if (b.lastHitAt[seg.id] !== undefined &&
              b.clock - b.lastHitAt[seg.id] <= CONVERGE_WINDOW) {
            dmg *= 1 + CONVERGE_BONUS;
          }
          b.lastHitAt[seg.id] = b.clock;
          damageSeg(w, ci, i, dmg, p);
          if (p.pierce > 0) p.pierce--;
          else { w.shots.splice(k, 1); hit = true; }
          break outer;
        }
      }
    }
    if (hit) continue;
  }
}

export function checkBreach(w) {
  for (const ch of w.chains) {
    for (let i = 0; i < ch.segs.length; i++) {
      const sp = segPos(w.path, w.pathLen, ch, i);
      if (!sp.off && sp.y >= w.L.FLOOR) return true;
    }
    // head ran off the end of the path entirely
    if (ch.segs.length && ch.s >= w.pathLen) return true;
  }
  return false;
}

export function breach(w) {
  // a shield charge eats the breach entirely
  if (w.shieldCharges > 0) {
    w.shieldCharges--;
    w.fx.push('SHIELD HELD', w.cannon.x, w.cannon.y - 70, '#e6e9e2');
    w.shake = Math.max(w.shake, 0.4);
    w.battery.streak = 0; w.battery.od = 0; w.battery.queued = false;
    spawnWave(w);
    return;
  }
  w.shake = Math.max(w.shake, 0.7);
  w.lives--;
  w.breaches++;
  w.battery.streak = 0; w.battery.od = 0; w.battery.queued = false;
  for (const g of w.battery.guns) g.heat = 0;
  if (w.lives <= 0) { w.running = false; w.over = true; }
  else spawnWave(w);
}

export function step(w, dt, firing = false) {
  // hit-stop: freeze the world briefly on a kill for impact
  if (w.hitStop > 0) {
    w.hitStop = Math.max(0, w.hitStop - dt);
    if (w.shake > 0) w.shake = Math.max(0, w.shake - dt * 2);
    return;
  }
  if (w.shake > 0) w.shake = Math.max(0, w.shake - dt * 2);

  stepCannon(w, dt, firing);
  stepPickups(w, dt);
  stepChains(w, dt);
  stepShots(w, dt);

  for (let i = w.bits.length - 1; i >= 0; i--) {
    const b = w.bits[i];
    b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 260 * dt;
    if (b.life <= 0) w.bits.splice(i, 1);
  }
  for (let i = w.floaters.length - 1; i >= 0; i--) {
    const f = w.floaters[i];
    f.life -= dt; f.y -= 26 * dt;
    if (f.life <= 0) w.floaters.splice(i, 1);
  }

  if (checkBreach(w)) { breach(w); return; }

  if (w.chains.length === 0 && !w.waveClear) {
    w.waveClear = true; w.clearTimer = 1.1;
    // clearing without losing a life is worth a bonus, scaled by wave
    w.score += 200 + w.wave * 50;
  }
  if (w.waveClear) {
    w.clearTimer -= dt;
    if (w.clearTimer <= 0) {
      // hand control back to the player to spend scrap before the next wave
      w.waveClear = false;
      w.shopOpen = true;
      w.running = false;
    }
  }
}

/** Leave the shop and start the next wave. */
export function nextWave(w) {
  w.shopOpen = false;
  w.wave++;
  spawnWave(w);
  w.running = true;
}
