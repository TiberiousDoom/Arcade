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
export const HP_SCALE_MAX = 6.5;

/* Wave 7 is where `waveCount` hits its 78-craft ceiling, so from there on the
   chain stops getting longer — and length is the dial a player can actually
   *see*. Speed keeps climbing to wave 12 and this multiplier to wave 18, but
   neither reads as "more" the way a longer column does, which is why the
   difficulty was reported as falling off a cliff at exactly seven.

   The fix has to come from the dials with headroom, because the length cap is
   geometric rather than a matter of taste (see `waveCount`). So: a second,
   steeper hp term past wave 7, and more simultaneous chains. Same "bend it,
   don't tilt it" shape Choke Point's `past5` uses — waves 1-6 were confirmed
   fine on device and are left exactly as they were. */
const past7 = (wave) => Math.max(0, wave - 7);
export const HP_PER_WAVE_LATE = 0.16;

export function hpScale(wave) {
  return Math.min(HP_SCALE_MAX,
    1 + (wave - 1) * HP_PER_WAVE + past7(wave) * HP_PER_WAVE_LATE);
}

/* A second and third *column* was the obvious way to escalate once the chain
   cannot get longer, and it was tried and rejected here — worth recording so
   it is not retried on the same reasoning.

   Splitting a wave's craft across two chains is not the neutral rearrangement
   it looks like. Each chain grows its own head, and a head is both the
   toughest kind and body-armoured while anything trails it, so two columns of
   39 carry ~21% more health than one of 78 and a good deal more of it is
   parked behind armour. Measured against the balance guard below, that step
   put a *perfectly played, fully maxed* battery into its first breach the
   moment the second column appeared, at every threshold tried between waves
   13 and 16. The board got harder in a jump rather than on a curve.

   `hpScale` is the dial with headroom, exactly as the note on `waveCount`
   says, so the late-game escalation comes from there instead. */

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
 *
 *  Softened twice now — (0.5 + ratio*2.2) → (0.35 + ratio*1.3) → this. The
 *  recoil is nominally a *reward*: the column is shoved backwards, which buys
 *  time. It kept getting reported as a penalty anyway, and the reason is that
 *  the shove also drags every target out from under an aim that was already
 *  laid on them. Past a certain size it stops reading as "I bought time" and
 *  starts reading as "the game moved my shot". Smaller is better here even
 *  though it is strictly less generous. */
export function recoilGain(spacing, headSide, remaining) {
  if (headSide <= 0 || remaining <= 0) return 0;
  return spacing * (0.12 + (headSide / remaining) * 0.5);
}

/** How fast a chain pays its recoil back, as a multiple of its forward speed.
 *  Lowered alongside `recoilGain`: the distance travelled matters, but so does
 *  the speed of the lurch, and at 2.4x the column snapped backwards fast enough
 *  to look like a glitch rather than a shove. */
export const RECOIL_RATE = 1.3;

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
    blurb: 'More damage per round, and a bigger round',
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
    blurb: 'Less heat per shot, faster cooling, shorter overheat lockout',
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
    blurb: 'Faster rounds, and the aim marker leads targets further ahead',
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
    blurb: 'Rounds punch through more craft and bounce off more walls',
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

/* Upgrades are **per emplacement**, not battery-wide.

   They used to be one shared set, which meant a second mount arrived already
   carrying every tier the first had bought — so more mounts was strictly more
   gun, and the only question was how fast you could afford them. Now each
   emplacement owns its tiers and starts from nothing, so a fifth mount competes
   directly against deepening the four you have. That is the intended balance
   and the reason the prices were left alone: the bill for a fully-kitted
   five-mount battery is five times the tree, and it should be.

   The trade this creates is the point — a wide battery of shallow guns covers
   the board, a narrow one of deep guns punches through armour, and no run
   affords both. */

/** Cost of the next tier in a branch for one gun, or null if it cannot be
 *  bought — either the branch is maxed, or the next tier is past what research
 *  has opened up.
 *
 *  `cap` is optional so the many callers that only care about the price still
 *  work; anything enforcing the research gate passes `tierCap(w, branch)`.
 *  Returning null for a locked tier means the shop's existing "maxed" path
 *  renders it with no new state to thread through. */
export function upgradeCost(upgrades, branch, cap = MAX_TIER) {
  const t = upgrades[branch];
  if (t >= Math.min(MAX_TIER, cap)) return null;
  return UPGRADES[branch].costs[t];
}

export function gunAt(w, mountIndex) {
  return w.battery.guns[mountIndex] || null;
}

export function canAfford(w, mountIndex, branch) {
  const g = gunAt(w, mountIndex);
  if (!g) return false;
  const c = upgradeCost(g.upgrades, branch, tierCap(w, branch));
  return c !== null && w.scrap >= c;
}

/** Buy one tier for one emplacement. Returns true if it went through. */
export function buyUpgrade(w, mountIndex, branch) {
  if (!BRANCHES.includes(branch)) return false;
  const g = gunAt(w, mountIndex);
  if (!g) return false;
  const cost = upgradeCost(g.upgrades, branch, tierCap(w, branch));
  if (cost === null || w.scrap < cost) return false;
  w.scrap -= cost;
  g.upgrades[branch]++;
  return true;
}

/** Resolved stats for one gun's tiers. Read this rather than the tables.
 *  Every caller has to say *which* gun — there is no battery-wide answer any
 *  more, and a default would quietly hand back the wrong numbers. */
export function stats(w, gun) {
  const u = (gun && gun.upgrades) || newUpgrades();
  return {
    ...UPGRADES.barrel.tiers[u.barrel],
    ...UPGRADES.chamber.tiers[u.chamber],
    ...UPGRADES.optics.tiers[u.optics],
    ...UPGRADES.munitions.tiers[u.munitions],
  };
}

/** Scrap to max every branch on **one** emplacement. */
export function fullTreeCost() {
  return BRANCHES.reduce((sum, b) => sum + UPGRADES[b].costs.reduce((a, c) => a + c, 0), 0);
}

/** Scrap to max every branch on every mount a battery could ever have, plus
 *  the mounts themselves. The number a run must not be able to reach. */
export function fullBatteryCost() {
  return fullTreeCost() * MAX_MOUNTS + MOUNT_COST.reduce((a, c) => a + c, 0);
}

/* ---------- world ---------- */

/** Breaches a run survives. Named because the header now draws one pip per
 *  life and needs to know how many slots to show even after they are spent. */
export const START_LIVES = 3;

export function createWorld(opts = {}) {
  const L = { ...LAYOUT, ...(opts.layout || {}) };
  const { path, pathLen } = buildPath(L);
  const w = {
    L, path, pathLen,
    chains: [], shots: [], bits: [], floaters: [],
    wave: 1, score: 0, scrap: 0, lives: START_LIVES,
    /* What this run may fit. Derived from `research.guns` below rather than
       owned: research is permanent, this is the run's view of it. */
    gunUnlocks: { auto: false, rail: false, mortar: false, ion: false },
    /* Permanent progression. Lives on the world so the engine stays the only
       thing that resolves what is buyable, but the *shell* loads and saves it —
       the engine touches no storage, same rule as every other engine here. */
    research: sanitizeResearch(opts.research),
    researchPaid: false,
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
    shopOpen: false, retry: false,
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
  syncGunUnlocks(w);
  return w;
}

/** Push permanent research down into the run's `gunUnlocks`. Called anywhere a
 *  run starts or restarts, so a researched gun is fittable from wave 1 without
 *  every call site having to know research exists. */
export function syncGunUnlocks(w) {
  for (const t of Object.keys(w.gunUnlocks)) {
    if (w.research?.guns?.[t]) w.gunUnlocks[t] = true;
  }
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
  // One column. Splitters still make more of them mid-wave; see the note above
  // hpScale for why the *spawn* does not.
  w.chains = [makeChain(waveCount(w.wave), waveSpeed(w.wave, w.pathLen), -30,
                        SEGMENT_SPACING, w.wave)];
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
    shopOpen: w.shopOpen, retry: !!w.retry,
    /* `gunUnlocks` is deliberately NOT stored. It stopped being run state in
       v28: it is a projection of permanent research, which the shell reads from
       storage. Storing it would let a save carry a gun the current research has
       not bought — and, worse, would pin a resumed run to whatever was learned
       at save time even after more has been researched since. */
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
      // upgrades ride with the gun now, not the world — a mount is defined by
      // what has been sunk into it, so restoring the two separately would let
      // them drift apart
      guns: b.guns.map(g => ({
        x: g.x, type: g.type, heat: g.heat, cool: g.cool, locked: g.locked,
        barrels: barrelsOf(g),
        upgrades: { ...g.upgrades },
      })),
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
  w.lives = snap.lives ?? START_LIVES;
  w.breaches = snap.breaches ?? 0;
  w.over = !!snap.over;
  w.waveClear = !!snap.waveClear; w.clearTimer = snap.clearTimer ?? 0;
  w.shopOpen = !!snap.shopOpen;
  w.retry = !!snap.retry;
  // re-derived from research below, not read from the save — see `snapshot`
  w.gunUnlocks = { auto: false, rail: false, mortar: false, ion: false };
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
    /* Per-gun tiers, falling back to the pre-v27 battery-wide set. A run saved
       on the old build had one shared tree, and the fair reading of it is that
       every mount had those tiers — dropping them instead would silently strip
       a resumed player of everything they had bought. */
    upgrades: { ...newUpgrades(), ...(snap.upgrades || {}), ...(g.upgrades || {}) },
    /* Same fallback for barrels, which were battery-wide until v28: a run saved
       on the old build stored one top-level count, and the fair reading is that
       every mount had it — that is exactly what the old build did. Reading only
       the per-gun field would resume a three-barrel battery as a one-barrel
       one, silently deleting the most expensive thing the player had bought. */
    barrels: clamp(Math.floor(g.barrels ?? snap.barrels ?? 1), 1, MAX_BARRELS),
  }));
  w.battery = b;
  w.cannon = b;              // the alias every call site uses
  w.cannon.x = w.L.W / 2;
  /* Research is *not* in the snapshot — it is not run state, and the shell
     reads the current one from storage. But a resumed run still has to be able
     to fit what has been researched since, so the unlocks are re-derived. */
  syncGunUnlocks(w);
  return true;
}

export function resetRun(w) {
  w.wave = 1; w.score = 0; w.scrap = 0; w.lives = START_LIVES;
  w.over = false; w.breaches = 0;
  // upgrades live on the guns, and makeBattery below builds fresh ones
  w.pickups = []; w.effects = {}; w.shieldCharges = 0; w.dropSeed = 987654321;
  w.shake = 0; w.hitStop = 0;
  w.shopOpen = false; w.retry = false;
  w.gunUnlocks = { auto: false, rail: false, mortar: false, ion: false };
  // research deliberately survives: it is the thing that carries between runs.
  // Its unlocks come straight back, so a researched gun is fittable from wave 1.
  w.researchPaid = false;
  syncGunUnlocks(w);
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

/** A top-tier upgrade: a mount fires this many barrels per volley instead of
 *  one, all sharing that mount's own heat and cooldown.
 *
 *  **Per emplacement**, reversing the 2026-08-02 call that made it
 *  battery-wide. The reasoning then was that one dial matched how mount *count*
 *  works and avoided introducing the repo's first per-gun-instance upgrade —
 *  and v27 then moved the entire four-branch tree onto the gun, which made
 *  per-gun-instance upgrades the norm and left the barrel count the one thing
 *  that was not. Reversing it is what makes the shop consistent: everything on
 *  a mount's tab now belongs to that mount.
 *
 *  Nothing about the balancing had to change: heat is already per-gun and
 *  already scales with barrel count, so three barrels still costs three times
 *  the heat of one. */
export const MAX_BARRELS = 3;
/** Cost of a mount's 2nd and 3rd barrel.
 *
 *  Cut from [260, 460]: that was priced as a single battery-wide purchase, and
 *  the same numbers bought five times over would have been a bill no run could
 *  reach. At these, kitting all five mounts out costs roughly double what the
 *  one battery-wide purchase used to — expensive, but a real ambition. */
export const BARREL_COST = [140, 250];

/** Barrels on a mount, tolerating a gun from before they were per-mount. */
export const barrelsOf = (gun) => clamp(Math.floor(gun?.barrels ?? 1), 1, MAX_BARRELS);

export function barrelCost(w, mountIndex) {
  const g = gunAt(w, mountIndex);
  if (!g) return null;
  const n = barrelsOf(g);
  return n >= MAX_BARRELS ? null : BARREL_COST[n - 1];
}

export function buyBarrel(w, mountIndex) {
  const g = gunAt(w, mountIndex);
  const cost = barrelCost(w, mountIndex);
  if (!g || cost === null || w.scrap < cost) return false;
  w.scrap -= cost;
  g.barrels = barrelsOf(g) + 1;
  return true;
}

/* ---------- research: the progression that outlives a run ----------

   Two currencies, kept strictly apart.

   **Scrap** is the run's economy: earned from kills, spent on tiers, barrels,
   mounts and retrofits, and gone when the run ends. **Research points** are
   what a whole run was worth, awarded once at the end of it and never lost.

   They are separate on purpose. Gun types used to be unlocked with scrap, which
   meant researching the railgun, dying, and researching it again from scratch —
   the same discovery bought over and over, out of the same pocket that was
   supposed to be buying guns. Now knowing how to build a railgun is permanent
   and *fitting* one still costs scrap every run, so the in-run decision survives
   while the busywork does not.

   The engine holds research on the world and touches no storage, exactly as
   Choke Point's armoury does; the shell loads and saves it. `resetRun` leaves
   it alone — carrying over is the entire point. */

/** Research points a finished run is worth.
 *
 *  A function of the wave reached, so what earns progression is the thing the
 *  player is already trying to do, and paid at the *end* of a run so it cannot
 *  be farmed by restarting a good opening over and over. The bonus every fifth
 *  wave is what makes pushing one wave deeper worth more than a safe retreat. */
export function researchEarned(w) {
  const reached = Math.max(0, (w.wave || 1) - 1);
  return reached + Math.floor((w.wave || 1) / 5) * 2;
}

/** Branch tiers available without research. Tiers 1-3 of every branch are free
 *  to anyone; 4 and 5 are what research buys, per branch. */
export const FREE_TIER = 3;
/** Research points for the 4th and then the 5th tier of a branch. */
export const DEPTH_RP = [3, 6];
/** Research points to learn a gun type permanently. Deliberately steeper than
 *  the depth unlocks: a new gun changes what a run can do, where a deeper tier
 *  only changes by how much. */
export const GUN_RP = { auto: 4, rail: 6, mortar: 7, ion: 9 };

export function newResearch() {
  const depth = {};
  for (const b of BRANCHES) depth[b] = 0;      // extra tiers unlocked past FREE_TIER
  return { points: 0, depth, guns: { auto: false, rail: false, mortar: false, ion: false } };
}

/** Defensive read of a stored research object — a value past the caps would
 *  quietly hand out tiers no shop could sell. Same guard shape as the armoury. */
export function sanitizeResearch(raw) {
  const r = newResearch();
  if (!raw || typeof raw !== 'object') return r;
  r.points = Math.max(0, Math.floor(Number(raw.points) || 0));
  for (const b of BRANCHES) {
    r.depth[b] = clamp(Math.floor(Number(raw.depth?.[b]) || 0), 0, MAX_TIER - FREE_TIER);
  }
  for (const t of Object.keys(r.guns)) r.guns[t] = !!raw.guns?.[t];
  return r;
}

/** The deepest tier a branch may currently be bought to. */
export function tierCap(w, branch) {
  return FREE_TIER + (w.research?.depth?.[branch] ?? 0);
}

/** RP for the next depth unlock on a branch, or null if fully researched. */
export function depthCost(w, branch) {
  const have = w.research?.depth?.[branch] ?? 0;
  return have >= DEPTH_RP.length ? null : DEPTH_RP[have];
}

export function researchDepth(w, branch) {
  if (!BRANCHES.includes(branch)) return false;
  const cost = depthCost(w, branch);
  if (cost === null || w.research.points < cost) return false;
  w.research.points -= cost;
  w.research.depth[branch]++;
  return true;
}

/** RP to learn a gun type, or null if it is standard or already known. */
export function gunResearchCost(w, type) {
  if (!GUN_TYPES[type] || type === 'standard') return null;
  return w.research?.guns?.[type] ? null : GUN_RP[type];
}

/** Learn a gun type, permanently. Unlike the old scrap unlock, this survives
 *  the run — see the note above. */
export function researchGun(w, type) {
  const cost = gunResearchCost(w, type);
  if (cost === null || w.research.points < cost) return false;
  w.research.points -= cost;
  w.research.guns[type] = true;
  w.gunUnlocks[type] = true;         // the run's view of what it may fit
  return true;
}

/** Whether this run may fit `type` at all: standard always, anything else only
 *  once researched. `gunUnlocks` is the run-scoped mirror of `research.guns`,
 *  kept so every existing call site reads the same field it always did. */
export function gunAvailable(w, type) {
  return type === 'standard' || !!w.gunUnlocks[type];
}

/** Award a finished run's research and return what it paid, so the shell can
 *  say so on the banner. Idempotent per run: `paid` stops a second call (a
 *  re-render, a resumed game-over screen) paying twice. */
export function awardResearch(w) {
  if (w.researchPaid) return 0;
  const earned = researchEarned(w);
  w.researchPaid = true;
  w.research.points += earned;
  return earned;
}

/** Distance a lobbed round travels before it can hit anything — roughly two
 *  craft-spacings, so a mortar clears the leading rank and lands among the
 *  ones behind it. The whole reason to own one. */
export const MORTAR_ARM = 96;

/** Refitting a mount to a different type, in scrap, on top of the one-time
 *  research that made the type available at all.
 *
 *  A flat fraction of the type's `refitBase`: learning the gun is the expensive
 *  part and it is now paid once, forever, in research points — but *fitting*
 *  one still costs scrap every run, so which mounts get which gun stays a real
 *  decision rather than a free dial you flick every wave. */
export const RETROFIT_FRACTION = 0.45;

export function retrofitCost(w, mountIndex, type) {
  const g = w.battery.guns[mountIndex];
  const G = GUN_TYPES[type];
  if (!g || !G) return null;
  if (g.type === type) return null;                 // already this
  if (type !== 'standard' && !w.gunUnlocks[type]) return null;   // not researched
  return Math.round(G.refitBase * RETROFIT_FRACTION);
}

/** Assign an unlocked type to a mount, charging the retrofit.
 *  `free` is for building a mount rather than converting one — a fresh
 *  emplacement arrives as `standard` and nobody should be billed for that. */
export function setGunType(w, mountIndex, type, free = false) {
  const g = w.battery.guns[mountIndex];
  if (!g || !GUN_TYPES[type]) return false;
  if (type !== 'standard' && !w.gunUnlocks[type]) return false;
  if (!free && g.type !== type) {
    const cost = retrofitCost(w, mountIndex, type);
    if (cost === null || w.scrap < cost) return false;
    w.scrap -= cost;
  }
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
  const S = stats(w, gun);
  const G = GUN_TYPES[gun.type];
  const mount = b.guns.indexOf(gun);

  const muzzleX = gun.x, muzzleY = b.y;
  const tp = aimPoint(w);
  const a0 = Math.atan2(tp.y - muzzleY, tp.x - muzzleX);

  // A multi-barrel mount fires all its barrels in one volley, at a small
  // angular fan, sharing this one heat/cooldown pool — the natural balancing
  // lever for barrel count is that 3 barrels costs 3x the heat of 1, with no
  // new per-barrel state needed.
  gun.cool = T.rate * G.rate * (hasEffect(w, 'rapid') ? 0.55 : 1);
  gun.heat = clamp(gun.heat + HEAT_PER_SHOT * S.heatPerShot * barrelsOf(gun), 0, 1);
  if (gun.heat >= 1) {
    gun.locked = LOCK_TIME * S.lock; gun.heat = 1;
    // overheating one gun drops the shared streak, but not all the way — the
    // battery keeps firing on its other mounts
    b.streak = Math.max(0, b.streak - 4);
    b.od = tierForStreak(b.streak);
    w.fx.push('OVERHEAT', muzzleX, muzzleY - 60, '#e0503c');
  }

  const spd = S.shotSpeed * G.spd;
  /* `off` is a *lateral* displacement now, not an angular one, and `sub` marks
     a round from one of the flanking barrels.

     The barrels used to fan: same muzzle, slightly different headings. That is
     not what extra barrels look like — they sit either side of the main one and
     fire alongside it. So the offset moves the muzzle perpendicular to the aim
     and every round keeps the identical heading, which means they stay parallel
     for their whole flight instead of diverging. The flanking rounds are
     smaller and weaker, so a third barrel is a real increase without being
     three whole cannons. */
  const makeShot = (off, sub) => ({
    x: muzzleX + Math.cos(a0) * b.len - Math.sin(a0) * off,
    y: muzzleY + Math.sin(a0) * b.len + Math.cos(a0) * off,
    vx: Math.cos(a0) * spd,
    vy: Math.sin(a0) * spd,
    dmg: T.dmg * S.dmg * G.dmg * (sub ? SUB_BARREL_DMG : 1),
    pierce: T.pierce + S.pierce + G.pierce + (hasEffect(w, 'pierce') ? 2 : 0),
    bounces: S.bounces + (hasEffect(w, 'ricochet') ? 4 : 0),
    r: S.shotR * (sub ? SUB_BARREL_R : 1),
    // a lobbed round: `travelled` counts up in stepShots and nothing can be hit
    // until it passes MORTAR_ARM, which is what carries it over the front rank
    arc: G.arc ? true : false,
    travelled: 0,
    sub: !!sub,
    gun: gun.type,      // which mount fired this — damageSeg/isDeflected check this
    // The colour to draw this shot, baked in at fire time rather than read
    // live off the battery every frame — a shot fired while cool must stay
    // the colour it was fired at, not flip to red mid-flight the instant the
    // battery's streak climbs into Critical after it launched. The ion
    // cannon keeps its own colour regardless of tier, same as it always has.
    col: gun.type === 'ion' ? G.col : T.col,
  });

  // the main barrel first, so it is the shot returned to the caller
  const offsets = BARREL_OFFSETS[barrelsOf(gun)] ?? BARREL_OFFSETS[1];
  const shot = makeShot(0, false);
  w.shots.push(shot);
  for (const off of offsets) w.shots.push(makeShot(off, true));

  // Spread stays an angular fan: it is a power-up that widens your cone, which
  // is a different idea from a barrel that sits alongside the main one.
  if (hasEffect(w, 'spread')) {
    for (const da of [-0.16, 0.16]) {
      const s = makeShot(0, true);
      s.vx = Math.cos(a0 + da) * spd; s.vy = Math.sin(a0 + da) * spd;
      w.shots.push(s);
    }
  }
  return shot;
}

/** Lateral offsets, in pixels, for a mount's *flanking* barrels — the main one
 *  always sits at 0 and is never listed, so the count here is one less than
 *  `w.barrels`. Perpendicular to the aim, so the rounds fly parallel rather
 *  than diverging. Two barrels puts the extra on one side; three brackets the
 *  main barrel with one either way, which is the shape that was asked for. */
export const BARREL_OFFSETS = { 1: [], 2: [11], 3: [-13, 13] };
/** Flanking rounds are smaller and hit softer than the main barrel's. */
export const SUB_BARREL_DMG = 0.5;
export const SUB_BARREL_R = 0.7;

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

/** Gun types you can assign to a mount once researched. `refitBase` is the
 *  price scale a retrofit is derived from — it was the scrap cost of unlocking
 *  the type until v28 moved that to research points, and it survives as the
 *  "how serious a gun is this" number the refit fee reads. `standard` is the
 *  starting gun; the others trade fire rate for a special property, so the
 *  four upgrade branches map onto guns you can physically see. */
export const GUN_TYPES = {
  standard: { name: 'Cannon',     rate: 1.0,  dmg: 1.0, pierce: 0, spd: 1.0,  col: '#c9a227', refitBase: 0 },
  auto:     { name: 'Autocannon', rate: 0.5,  dmg: 0.6, pierce: 0, spd: 1.0,  col: '#8dbf4a', refitBase: 120 },
  rail:     { name: 'Railgun',    rate: 1.9,  dmg: 2.4, pierce: 2, spd: 1.7,  col: '#6fb7e8', refitBase: 160 },
  mortar:   { name: 'Mortar',     rate: 1.6,  dmg: 1.8, pierce: 0, spd: 0.75, col: '#e0503c', refitBase: 200, arc: true },
  // The one gun `shielded` can't deflect — the collision loop checks the
  // shot's `gun` field for the literal string 'ion' before ever calling
  // isDeflected, not a stat on this table.
  ion:      { name: 'Ion Cannon', rate: 1.3,  dmg: 1.1, pierce: 0, spd: 1.3,  col: '#7fe0ff', refitBase: 260 },
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
  // its own upgrade tiers: a new mount arrives bare, however deep the others are
  // its own barrel count too, for the same reason: everything on a mount's
  // shop tab should belong to that mount
  return { x, type, heat: 0, cool: 0, locked: 0, barrels: 1, upgrades: newUpgrades() };
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
  freeze:  { name: 'Freeze',  dur: 2.5, col: '#6fb7e8', blurb: 'The column halts' },
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
      const pay = Math.min(ch.recoil, ch.speed * RECOIL_RATE * dt);
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
  for (const g of b.guns) {
    g.cool = Math.max(0, g.cool - dt);
    g.locked = Math.max(0, g.locked - dt);
    // each mount cools at its own Chamber tier — a gun you have invested in
    // recovers faster than the one beside it, which is the whole point
    const rate = (g.locked > 0 ? HEAT_COOL_LOCKED : HEAT_COOL) * stats(w, g).cool;
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
    p.travelled = (p.travelled || 0) + Math.hypot(p.vx, p.vy) * dt;
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

    /* A lobbed round is *over* the column for the first stretch of its flight,
       so nothing can be hit until it comes back down. That is what "reaches
       over the front rank" means, and until now it meant nothing at all: the
       mortar set `arc: true` on its shots and no code anywhere read it, so a
       mortar round behaved exactly like a cannon round with a slow, heavy
       description attached.
       Implemented as an arming distance rather than a real parabola because
       the board is top-down — there is no third axis to arc through, and
       "cannot hit anything for the first N pixels" is the same rule a lob
       actually gives you. The shell draws the height that isn't in the model. */
    if (p.arc && p.travelled < MORTAR_ARM) continue;

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
  if (w.lives <= 0) { w.running = false; w.over = true; return; }

  /* Losing a life opens the shop, rather than throwing the same wave straight
     back at you. You have just earned scrap off the column that broke through
     and had nowhere to spend it — the wave restarted immediately and the only
     chance to buy anything was a clean clear, which is exactly the run you did
     not have. `retry` tells `nextWave` not to advance the counter: this is the
     same wave again, not the next one. */
  w.shopOpen = true;
  w.retry = true;
  w.running = false;
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

/** Leave the shop and put a wave on the board. Advances the counter unless the
 *  shop was opened by a breach, in which case this is a retry of the wave you
 *  just lost rather than the next one. */
export function nextWave(w) {
  w.shopOpen = false;
  // read the flag before clearing it, or every visit reads as a fresh wave
  const retrying = !!w.retry;
  w.retry = false;
  if (!retrying) w.wave++;
  spawnWave(w);
  w.running = true;
}
