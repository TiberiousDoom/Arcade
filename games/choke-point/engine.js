/* Choke Point — pure logic core.
   A grid tower-defense: surges flow along a fixed circuit path toward the core;
   you build auto-firing towers on empty cells to stop them. No DOM, no canvas,
   no timers. The only randomness is a seeded LCG (`rand`), so a seed replays a
   run exactly. The HTML shell owns rendering, input, and the frame loop. */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- board ---------- */

/** Square cells, so the portrait layout can be an exact transpose of landscape.
 *  That is what makes rotation lossless: turning the phone maps every cell
 *  (c, r) -> (r, c), and because cells are square the transposed path has the
 *  *same total length*, so an enemy's distance along it carries straight over
 *  with no rescaling. See `relayout`, and Feedline for the same trick. */
/*  Note CELL is a *resolution* knob, not an on-screen size one: the shell's
 *  makeFit scales the whole canvas to the stage, so a cell's physical size is
 *  screen-width / COLS. Bigger squares on a phone therefore means *fewer*
 *  columns, which is why the grid went 15x10 -> 12x8 (2026-07-27); CELL rose
 *  alongside only to keep the backing canvas sharp. */
export const CELL = 64;

/** The circuits, each a list of [col, row] waypoints in landscape space, within
 *  a 12x8 grid. Consecutive waypoints must be axis-aligned (only one coordinate
 *  changes) — `pathCells` walks between them a cell at a time and relies on it.
 *
 *  Several of them because a single fixed circuit meant every run was the same
 *  board: the whole game was one puzzle, solved once. A route is picked per run
 *  (not per wave — swapping the path mid-run would strand towers), so replaying
 *  is a different defense problem rather than the same one faster.
 *
 *  Transposing each (swap every pair) yields a valid portrait route by
 *  construction, since the grid dimensions swap too, and because cells are
 *  square the transposed path has an identical length. That is what keeps
 *  rotation lossless — see `relayout`. */
/*  Ordered by difficulty now, easiest first, and a run always starts on the
 *  first — it used to be picked from the seed, which made the opening board a
 *  coin toss. Length *is* the difficulty here: a longer route is more seconds
 *  under fire before anything reaches the core, so route 1 is the most
 *  forgiving and route 3 the least. Roughly 36 / 31 / 14 cells. */
const ROUTES = [
  // 1 — enters low and climbs, then descends in steps. The longest and most
  // wound: plenty of time on the board, though the lanes sit further apart so
  // a single tower covers less of it.
  [[0, 6], [10, 6], [10, 1], [3, 1], [3, 4], [7, 4], [7, 7], [11, 7]],
  // 2 — three long sweeps, doubling back. Plenty of cells that cover two lanes
  // at once, so it rewards finding the pinch points.
  [[0, 1], [9, 1], [9, 3], [2, 3], [2, 5], [11, 5], [11, 7]],
  // 3 — two turns and out. Less than half the length of the first, so there is
  // barely any time to kill; the compensation is that everything funnels
  // through one short corridor, and towers there all fire at once.
  [[0, 3], [7, 3], [7, 6], [11, 6]],
];
export const ROUTE_COUNT = ROUTES.length;

const transpose = (route) => route.map(([c, r]) => [r, c]);

export const LAYOUT = {
  COLS: 12, ROWS: 8, CELL,
  routes: ROUTES,
  /** The default circuit. Kept so callers that predate multiple routes, and
   *  anything that only needs "a" route, still work. */
  get route() { return this.routes[0]; },
  get W() { return this.COLS * this.CELL; },
  get H() { return this.ROWS * this.CELL; },
};

/** Portrait phones get the exact transpose — same cells, same routes, stood on
 *  their end. Keep these mirrored; `relayout` and a test both rely on it. */
export const LAYOUT_TALL = {
  COLS: LAYOUT.ROWS, ROWS: LAYOUT.COLS, CELL,
  routes: ROUTES.map(transpose),
  get route() { return this.routes[0]; },
  get W() { return this.COLS * this.CELL; },
  get H() { return this.ROWS * this.CELL; },
};

/** The route at `i` on this layout, wrapping so an out-of-range index is safe. */
export function routeAt(L, i = 0) {
  const rs = L.routes || [L.route];
  return rs[((i % rs.length) + rs.length) % rs.length];
}

export const cellCenter = (L, c, r) => ({ x: (c + 0.5) * L.CELL, y: (r + 0.5) * L.CELL });
export const inGrid = (L, c, r) => c >= 0 && r >= 0 && c < L.COLS && r < L.ROWS;
export const cellKey = (c, r) => c + ',' + r;

/** The cell under a pixel, or null if off the grid. */
export function cellAt(L, px, py) {
  const c = Math.floor(px / L.CELL), r = Math.floor(py / L.CELL);
  return inGrid(L, c, r) ? { c, r } : null;
}

/* ---------- path geometry (same arc-length model as Flak Battery) ---------- */

/** Build the polyline through the route's cell centers, tagging each vertex
 *  with cumulative arc-length `s`. Returns the points and the total length. */
export function buildPath(L, routeIndex = 0) {
  const pts = routeAt(L, routeIndex).map(([c, r]) => cellCenter(L, c, r));
  const path = [{ x: pts[0].x, y: pts[0].y, s: 0 }];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    path.push({ x: pts[i].x, y: pts[i].y, s: acc });
  }
  return { path, pathLen: acc };
}

/** Position at arc-length `s`. Clamped at both ends; `off` flags a point past
 *  the finish so callers can treat it as a leak. */
export function atS(path, pathLen, s) {
  if (s <= 0) return { x: path[0].x, y: path[0].y, off: false };
  if (s >= pathLen) { const e = path[path.length - 1]; return { x: e.x, y: e.y, off: true }; }
  let lo = 0, hi = path.length - 1;
  while (lo < hi - 1) {
    const m = (lo + hi) >> 1;
    if (path[m].s <= s) lo = m; else hi = m;
  }
  const a = path[lo], b = path[hi];
  const t = (s - a.s) / (b.s - a.s);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, off: false };
}

/** The set of cells the path runs through — non-buildable. Every cell a route
 *  segment crosses (segments are axis-aligned, so this is exact). */
export function pathCells(L, routeIndex = 0) {
  const set = new Set();
  const route = routeAt(L, routeIndex);
  for (let i = 1; i < route.length; i++) {
    let [c0, r0] = route[i - 1];
    const [c1, r1] = route[i];
    const dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0);
    set.add(cellKey(c0, r0));
    while (c0 !== c1 || r0 !== r1) { c0 += dc; r0 += dr; set.add(cellKey(c0, r0)); }
  }
  return set;
}

/* ---------- towers ---------- */

/** Three tower types. `stats(w, tower)` resolves the effective numbers; read
 *  from that, not these tables directly. Ranges are in pixels; rate is seconds
 *  between shots; slow is a fraction and duration in seconds. */
/* Each type is a base stat line plus two words: the track it is *good* at
   buying (`spec`, discounted in the armory) and the one it is bad at (`weak`,
   surcharged). That pairing is what keeps the three classes from converging on
   the same build — you can push a Node's fire rate cheaply and its splash only
   at a painful price, so a Node stays a Node however much you spend on it. */
export const TOWER_TYPES = {
  /* The splash here is deliberately tiny — a fifth of a cell, and even maxed it
     stays well under half of one, so a Node never becomes a cut-price Breaker.
     It is not zero because zero made the whole splash track inert: `stats`
     grows splash multiplicatively, so a base of 0 stayed 0 however much was
     spent, and splash is Node's `weak` track — meaning the armory charged a
     surcharge for an upgrade that did nothing whatsoever. A dear option is a
     judgement call; a dear option that does nothing is a trap. */
  node: {
    name: 'Node', cost: 12, col: '#6fb7e8', blurb: 'Quick, single target',
    base: { range: 92, rate: 0.5, dmg: 4, splash: 12, slow: 0, slowDur: 0 },
    spec: 'rate', weak: 'splash',
  },
  // Costs more up front than Node/Coil, deliberately: its raw power made it
  // affordable everywhere once money piled up, crowding Node out entirely
  // instead of leaving it the answer for single durable targets (and Phase,
  // which already resists Breaker's splash).
  breaker: {
    name: 'Breaker', cost: 48, col: '#e0503c', blurb: 'Heavy splash, long reach',
    base: { range: 120, rate: 1.4, dmg: 24, splash: 44, slow: 0, slowDur: 0 },
    spec: 'range', weak: 'rate',
  },
  /* Coil chills a small cluster rather than a single enemy, and buys splash
     cheap. Its splash used to be 0 with `spec: 'range'` — and because `stats`
     grows splash multiplicatively, a base of zero meant the splash track did
     *nothing* on a Coil at any price. Giving it a real base (about a third of a
     cell) is what makes the discount mean something, and it fits what Coil is
     for: SLOW_BRITTLE pays out on everything that shoots the target afterwards,
     so setting up three enemies is worth three times setting up one.
     `weak` moves to range in exchange, so the class is short-reach area
     support rather than a long-reach single-target debuff. */
  coil: {
    name: 'Coil', cost: 20, col: '#5fc9a4', blurb: 'Chills a cluster; slowed takes more',
    base: { range: 84, rate: 0.8, dmg: 2, splash: 24, slow: 0.4, slowDur: 1.2 },
    spec: 'splash', weak: 'dmg',
  },
};
export const TOWER_KEYS = Object.keys(TOWER_TYPES);

/* ---------- levelling ---------- */

/* Towers used to be upgraded by hand, three tiers, paid for out of the same
   pocket that bought new towers. That made every upgrade a question of "or I
   could just build another one", and the answer was nearly always another one.

   Now a tower levels itself by fighting: XP for damage dealt, a bonus for the
   killing blow. What you *spend* money on is the class as a whole, in the
   armory, and that carries between runs. So the two currencies of progress
   are separated — placement earns, purchase compounds. */
export const MAX_LEVEL = 10;

/* Both XP knobs were cut tenfold for v28: towers were reaching level 10 inside
   the opening waves, which made the whole climb a formality rather than a
   reward, and a maxed tower stops having anything to earn. At a tenth, the
   1→10 climb is around 6,000 damage from one tower — a wave-14 board is about
   4,600 hp all told, so a well-sited tower maxes out somewhere in the low-to-mid
   teens. Reachable, but as the pay-off for a tower that has done a run's work.

   The rate lives here rather than in `xpForNext` on purpose: the curve's shape
   (and the two tested Breaker-reach requirements that hang off levels) is
   unchanged, and there is exactly one number to turn if this wants tuning again. */

/** XP credited per point of damage that actually lands. */
export const XP_PER_DAMAGE = 0.1;
/** Per-class XP multiplier. XP is credited per point of damage *dealt*, and a
 *  Breaker deals several times what a Node does per shot — so on a flat rate the
 *  class that hits hardest also levels fastest, compounding an advantage it
 *  already had. Breaker earns at a discount to put the three classes on
 *  comparable footing per unit of work rather than per unit of damage. */
export const XP_RATE = { node: 1, breaker: 0.45, coil: 1.15 };
/** Flat XP for landing a kill, on top of the damage credited. Small on
 *  purpose: the bulk of a tower's XP should come from steady work, not from
 *  whoever happens to land the last hit on a Load. */
export const XP_KILL_BONUS = 0.3;

/** XP to get from `level` to the next one. */
export function xpForNext(level) {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round(18 * Math.pow(1.42, level - 1));
}

/** How much a stat grows across the whole 1→10 climb, interpolated linearly.
 *  `rate` is a cooldown in seconds, so it *divides* — a bigger number there
 *  means a shorter gap between shots. */
export const LEVEL_GAIN = { dmg: 1.5, range: 0.6, splash: 0.5, rate: 0.8 };

/** Grant XP and level up as far as it carries. Returns true if a level was
 *  gained, so the shell can pop something. */
export function addXp(tower, amount) {
  if (!(amount > 0) || tower.level >= MAX_LEVEL) return false;
  tower.xp += amount;
  let gained = false;
  while (tower.level < MAX_LEVEL && tower.xp >= xpForNext(tower.level)) {
    tower.xp -= xpForNext(tower.level);
    tower.level++;
    gained = true;
  }
  if (tower.level >= MAX_LEVEL) tower.xp = 0;
  return gained;
}

/* ---------- the armory: per-class upgrades, bought and kept ---------- */

export const CLASS_TRACKS = ['dmg', 'rate', 'range', 'splash'];
export const CLASS_MAX = 5;
/** Per-level growth for a purchased track, same divide-don't-multiply rule for
 *  `rate` as above. Range is exactly 1/15 a level so five levels is a clean
 *  +1/3 — see the Breaker reach note on `stats`. */
export const CLASS_GAIN = { dmg: 0.12, rate: 0.1, range: 1 / 15, splash: 0.15 };

/* Raised across the board in v31: the armory is permanent, so it is the one
   economy where being able to fill it quickly means the game solves itself for
   good rather than for a run. */
const CLASS_BASE_COST = { dmg: 95, rate: 88, range: 80, splash: 88 };
/** A class buys its speciality at a discount and its opposite at a surcharge. */
export const SPEC_DISCOUNT = 0.6;
export const WEAK_PENALTY = 1.8;
/** Each level of a track costs this much more than the one before.
 *
 *  The curve used to be linear (`base * (1 + level * 0.8)`), so the fifth level
 *  cost only four times the first and a full track was cheap enough that the
 *  armory filled up quickly — which matters more here than anywhere else,
 *  because the armory never resets. Geometric now, matching every other cost
 *  curve in the repo (Flak Battery's branches run about 1.75x a tier, its
 *  mounts about 1.6x a step): the last level costs twelve times the first, and
 *  a full track runs roughly double what it did. */
export const CLASS_COST_STEP = 2.15;

export function newClassUpgrades() {
  const out = {};
  for (const k of TOWER_KEYS) {
    out[k] = {};
    for (const t of CLASS_TRACKS) out[k][t] = 0;
  }
  return out;
}

/** Cost of the next level of `track` for `type`, or null if maxed. */
export function classCost(type, track, level) {
  if (!TOWER_TYPES[type] || !CLASS_TRACKS.includes(track)) return null;
  if (level >= CLASS_MAX) return null;
  const T = TOWER_TYPES[type];
  let c = CLASS_BASE_COST[track] * Math.pow(CLASS_COST_STEP, level);
  if (T.spec === track) c *= SPEC_DISCOUNT;
  if (T.weak === track) c *= WEAK_PENALTY;
  return Math.round(c);
}

/** Buy one level of a class track out of the run's components. */
export function buyClassUpgrade(w, type, track) {
  const have = w.classUpgrades?.[type];
  if (!have) return false;
  const cost = classCost(type, track, have[track]);
  if (cost === null || w.components < cost) return false;
  w.components -= cost;
  have[track]++;
  return true;
}

/** Components returned when a tower is sold: half its build cost. Levelling is
 *  earned rather than bought, so there is nothing else sunk in to refund. */
export function sellValue(tower) {
  return Math.floor(TOWER_TYPES[tower.type].cost * 0.5);
}

/** Effective stats: base × level × whatever the armory has bought for the
 *  class. The one place stats come from — never read `base` directly.
 *
 *  Two numbers here are requirements rather than taste, and both are pinned by
 *  tests: a Breaker at level 10 reaches exactly three cells (120 × 1.6 = 192,
 *  and CELL is 64), and one at level 10 with the range track maxed reaches
 *  exactly four (192 × 4/3 = 256). */
export function stats(w, tower) {
  const T = TOWER_TYPES[tower.type];
  const b = T.base;
  const t = (Math.min(MAX_LEVEL, tower.level || 1) - 1) / (MAX_LEVEL - 1);
  const cls = w?.classUpgrades?.[tower.type] || { dmg: 0, rate: 0, range: 0, splash: 0 };

  const grow = (k) => (1 + LEVEL_GAIN[k] * t) * (1 + CLASS_GAIN[k] * cls[k]);
  return {
    range: b.range * grow('range'),
    dmg: b.dmg * grow('dmg'),
    splash: b.splash * grow('splash'),
    rate: b.rate / grow('rate'),
    slow: b.slow,
    slowDur: b.slowDur,
  };
}

/* ---------- enemies ---------- */

/** Base speed a surge covers in pixels per second. Flat, not scaled by board
 *  size: because both layouts share a path length, a flat speed already gives
 *  the same crossing time either way. */
/*  Enemies used to differ only in hp, speed and bounty, which meant there was
 *  never a reason to build a *mix* of towers — more of whatever was strongest
 *  was always correct. These traits exist to make specific towers the wrong
 *  answer, so a defense has to cover several cases:
 *
 *    armor        flat reduction on every hit, so many weak shots (Node) are
 *                 wasted and few heavy ones (Breaker) are right
 *    splashResist takes only part of splash damage — the mirror case, where
 *                 Breaker's area damage is the wrong tool
 *    slowImmune   Coil cannot slow it, so it cannot be set up for `brittle`
 *    heals        repairs nearby enemies, which makes target priority matter
 *                 rather than just total damage
 */
// Bounties cut twice now: ~65% of the original table last pass, and further
// here — feedback said charge still piled up too fast even after that cut.
export const ENEMY_TYPES = {
  surge: { name: 'Surge', hp: 20, speed: 62, bounty: 1, r: 12, col: '#e6e9e2' },
  spark: { name: 'Spark', hp: 12, speed: 112, bounty: 2, r: 9, col: '#c9a227' },
  load:  { name: 'Load',  hp: 92, speed: 40, bounty: 3, r: 19, col: '#7f8fa0' },
  // many, tiny and quick: the case splash damage is *for*
  swarm: { name: 'Swarm', hp: 7, speed: 128, bounty: 1, r: 7, col: '#d8763a' },
  // plated: chips a flat amount off every hit, so a tier-0 Node barely dents it
  // while a Breaker hardly notices. Deliberately 3 and not higher — at 6 it
  // exceeded Node's base damage outright, which made Node permanently useless
  // here rather than something worth *upgrading* to make viable.
  shell: { name: 'Shell', hp: 70, speed: 46, bounty: 4, r: 17, col: '#4d7fb3', armor: 3 },
  // insulated against splash, and quick — punish leaning on Breaker
  phase: { name: 'Phase', hp: 34, speed: 104, bounty: 4, r: 10, col: '#b58fd0',
           splashResist: 0.8, slowImmune: true },
  // repairs its neighbors. Towers shoot the furthest-along enemy, so a patch
  // trailing the pack is safe unless you build to reach it. Heal rate/radius
  // raised and unlock pulled earlier so it's a real nuisance, not a no-op —
  // at wave 11 with a 96px/7hp-per-sec heal it was over before it mattered.
  patch: { name: 'Patch', hp: 44, speed: 54, bounty: 4, r: 13, col: '#5fc9a4', heals: 12 },
  /* Carries Swarm and lets them out. It halts periodically to deploy a batch
     mid-path, and scatters half a batch again where it dies — so killing one
     early, far from your guns, is not automatically the right play. The
     biggest thing on the board, and the slowest. */
  tank:  { name: 'Tank',  hp: 150, speed: 32, bounty: 6, r: 22, col: '#c76b8a',
           deploys: 'swarm', deployCount: 4, deployEvery: 3.2, deployStop: 1.1 },
};
export const ENEMY_KEYS = Object.keys(ENEMY_TYPES);

/** Components a kill pays, after the difficulty's cut. Fractional bounties are
 *  kept as fractions rather than rounded per kill — rounding a 0.75 bounty on a
 *  1-component Surge would floor to 0 and make Hard's Swarm worthless. The HUD
 *  floors the total for display. */
export function bountyOf(w, type) {
  return ENEMY_TYPES[type].bounty * (diffOf(w.difficulty).bounty ?? 1);
}

/** How far a Patch's repair reaches, in pixels. */
export const HEAL_RADIUS = 140;
/** No hit is ever fully absorbed — armor caps out at leaving this through. */
export const MIN_DAMAGE = 1;
/** A slowed enemy takes this much extra damage. This is what makes Coil worth
 *  building: on its own it barely scratches anything, but it sets targets up
 *  for everything else, so it becomes a support piece rather than a weak gun. */
export const SLOW_BRITTLE = 1.4;

/* ---------- waves ---------- */

/* The armory persists between runs, so without a counterweight every run
   after the first is easier than the last and the game quietly solves itself.
   Difficulty is that counterweight, and it is the player's dial rather than an
   automatic scaling: pick the level that makes your current armory interesting.
   Recorded alongside the score, so an easy run is never compared to a hard one. */
/* `winWave` is the wave that ends a run in victory rather than in a breach. A
   tower defense with no finish line is a game you can only ever lose, and the
   run that goes best is the one that ends most anticlimactically — so each
   difficulty now has a line to cross. Higher difficulties ask for longer runs
   as well as harder ones, so the three are not interchangeable. */
/* The ladder shifted up one rung in v30: Easy was reported as too easy, so the
   old Medium *is* the new Easy and the old Hard is the new Medium. Hard is a
   new step above anything that existed before — a real wall rather than a
   relabelling, since simply renaming would have left the top of the game where
   it already was.

   Harder settings also slow *levelling* (`xp`): a longer run at a higher
   difficulty would otherwise hand out more total damage and so more levels,
   which is the opposite of what raising the difficulty should do.

   Hard also scales `bounty`, which the other two do not touch. Past a point,
   more enemy health alone stops being difficulty and becomes waiting: your
   towers still win every exchange, each one just takes longer. Cutting the
   income as well is what makes a hard board a question about what you can
   afford rather than about your patience. */
export const DIFFICULTIES = {
  easy:   { name: 'Easy',   hp: 1.0,  components: 55, integrity: 20, bounty: 1,    xp: 1,    winWave: 50 },
  medium: { name: 'Medium', hp: 1.35, components: 40, integrity: 14, bounty: 1,    xp: 0.7,  winWave: 100 },
  hard:   { name: 'Hard',   hp: 1.9,  components: 30, integrity: 10, bounty: 0.75, xp: 0.45, winWave: 150 },
};
export const DIFFICULTY_KEYS = Object.keys(DIFFICULTIES);
/* Easy is the default now, not medium: it is the only difficulty a new player
   has, since the other two are earned. */
export const DEFAULT_DIFFICULTY = 'easy';
export const diffOf = (k) => DIFFICULTIES[k] || DIFFICULTIES[DEFAULT_DIFFICULTY];

/** The wave that wins a run at this difficulty. */
export const winWave = (difficulty) => diffOf(difficulty).winWave;

/* ---------- progression: what a player has earned ----------

   Losing used to advance you to the next circuit, which had it exactly
   backwards — failing on route 1 moved you to the harder route 2, so a player
   who could not beat the easiest board was handed a worse one. Routes are
   earned now: you keep replaying the one you are on until you win it.

   Same division of labour as the armory: these are pure functions over a
   plain object, and the *shell* is what loads and saves it. */

export function newProgress() {
  const wins = {};
  for (const k of DIFFICULTY_KEYS) wins[k] = [];
  return { wins };
}

/** Defensive read of stored progress — junk degrades to "nothing unlocked"
 *  rather than to a crash or to everything unlocked. */
export function sanitizeProgress(raw) {
  const p = newProgress();
  if (!raw || typeof raw !== 'object') return p;
  for (const k of DIFFICULTY_KEYS) {
    const list = Array.isArray(raw.wins?.[k]) ? raw.wins[k] : [];
    p.wins[k] = [...new Set(list
      .map(n => Math.floor(Number(n)))
      .filter(n => Number.isInteger(n) && n >= 0 && n < ROUTE_COUNT))].sort((a, b) => a - b);
  }
  return p;
}

export const hasWon = (progress, difficulty, routeIndex) =>
  !!progress?.wins?.[difficulty]?.includes(routeIndex);

/** Route 1 is always open; every later one waits on the win before it. */
export function routeUnlocked(progress, difficulty, routeIndex) {
  if (routeIndex <= 0) return true;
  if (routeIndex >= ROUTE_COUNT) return false;
  return hasWon(progress, difficulty, routeIndex - 1);
}

export function unlockedRoutes(progress, difficulty) {
  let n = 1;
  while (n < ROUTE_COUNT && routeUnlocked(progress, difficulty, n)) n++;
  return n;
}

/** Easy is always open; each harder difficulty waits on a win below it. One
 *  win is enough — clearing every route on Easy before Medium appears would be
 *  three full runs of gate rather than a step up. */
export function difficultyUnlocked(progress, difficulty) {
  const i = DIFFICULTY_KEYS.indexOf(difficulty);
  if (i <= 0) return i === 0;
  return (progress?.wins?.[DIFFICULTY_KEYS[i - 1]] || []).length > 0;
}

/** Bank a win. Returns what it opened up, so the shell can say so. */
export function recordWin(progress, difficulty, routeIndex) {
  const before = {
    routes: unlockedRoutes(progress, difficulty),
    diffs: DIFFICULTY_KEYS.filter(k => difficultyUnlocked(progress, k)).length,
  };
  if (!hasWon(progress, difficulty, routeIndex)) {
    progress.wins[difficulty] = [...progress.wins[difficulty], routeIndex].sort((a, b) => a - b);
  }
  const i = DIFFICULTY_KEYS.indexOf(difficulty);
  return {
    route: unlockedRoutes(progress, difficulty) > before.routes ? routeIndex + 1 : null,
    difficulty: DIFFICULTY_KEYS.filter(k => difficultyUnlocked(progress, k)).length > before.diffs
      ? DIFFICULTY_KEYS[i + 1] : null,
  };
}

/* Derived from the default rather than hardcoded to medium — the default moved
   to easy when the harder two became things you earn, and a constant naming one
   difficulty while `createWorld` used another is a trap for every test that
   reaches for it. */
export const START_COMPONENTS = diffOf(DEFAULT_DIFFICULTY).components;
export const START_INTEGRITY = diffOf(DEFAULT_DIFFICULTY).integrity;

/** Deterministic composition of a wave: a list of spawn groups, each a type,
 *  a count, and the gap in seconds between spawns. Escalates forever, and
 *  introduces the tougher types at thresholds. HP and counts climb with the
 *  wave; the shell scales enemy hp via `hpScale`. */
/** The wave each enemy type first appears on. One new idea at a time, so each
 *  trait can be met and understood on its own rather than all at once — same
 *  reasoning as Flak Battery's KIND_UNLOCK. */
export const ENEMY_UNLOCK = {
  surge: 1, spark: 3, swarm: 4, load: 5, shell: 7, patch: 8, phase: 9, tank: 10,
};

/** Types available on a given wave, in unlock order. */
export function enemiesForWave(wave) {
  return ENEMY_KEYS.filter(k => wave >= ENEMY_UNLOCK[k]);
}

/** Waves 1-5 were confirmed well-paced on device, so their rate is untouched;
 *  everything past 5 gets an extra term on top. `surge`'s count is the clearest
 *  example: +2/wave throughout, plus another +2 for every wave beyond the
 *  fifth, so the curve bends upward rather than the whole line getting
 *  steeper (which would have made the confirmed-good opening harder too). */
const past5 = (wave) => Math.max(0, wave - 5);

export function wavePlan(wave) {
  const groups = [{ type: 'surge', count: 6 + wave * 2 + past5(wave) * 2, gap: 0.7 }];
  if (wave >= ENEMY_UNLOCK.spark) groups.push({ type: 'spark', count: 3 + Math.floor(wave / 2) + past5(wave), gap: 0.45 });
  // swarms come in a tight burst — that clustering is what makes splash pay
  if (wave >= ENEMY_UNLOCK.swarm) groups.push({ type: 'swarm', count: 6 + wave + past5(wave) * 2, gap: 0.16 });
  if (wave >= ENEMY_UNLOCK.load) groups.push({ type: 'load', count: 1 + Math.floor((wave - 5) / 2), gap: 1.1 });
  if (wave >= ENEMY_UNLOCK.shell) groups.push({ type: 'shell', count: 1 + Math.floor((wave - 7) / 3), gap: 1.3 });
  if (wave >= ENEMY_UNLOCK.phase) groups.push({ type: 'phase', count: 2 + Math.floor((wave - 9) / 2), gap: 0.6 });
  // one patch at a time: two would heal each other and stall the wave
  if (wave >= ENEMY_UNLOCK.patch) groups.push({ type: 'patch', count: 1, gap: 1.5 });
  // tanks arrive rarely — each one is a moving swarm dispenser, so two early
  // would flood the board with more than the towers could ever chew
  if (wave >= ENEMY_UNLOCK.tank) groups.push({ type: 'tank', count: 1 + Math.floor((wave - 10) / 4), gap: 2.4 });

  /* Second releases. Past a point, adding yet more to the *first* group of a
     type just makes one long queue of the same thing; a separate later release
     lands while you are still busy with something else, which is what makes a
     deep wave feel different rather than merely longer. */
  if (wave >= 12) groups.push({ type: 'surge', count: 4 + past5(wave), gap: 0.5 });
  if (wave >= 14) groups.push({ type: 'swarm', count: 6 + past5(wave), gap: 0.14 });
  if (wave >= 16) groups.push({ type: 'spark', count: 4 + Math.floor(wave / 3), gap: 0.35 });
  return groups;
}

/** How far into a group the next one starts. Groups used to run strictly end
 *  to end with a breath between, so a wave was a sequence of single-type
 *  problems solved one at a time — the Sparks were gone before the Loads
 *  arrived. Overlapping them is what forces a defense to cover several cases
 *  at once, which is the entire point of having enemy traits. */
export const GROUP_OVERLAP = 0.55;

/** Enemy hp is multiplied by this, so late waves stay threatening without new
 *  tables. +12% a wave to start, and a second +8% for every wave past the
 *  fifth — same "bend it, don't tilt it" shape as `wavePlan` above, for the
 *  same reason: the early waves were already right. */
export function hpScale(wave, difficulty = DEFAULT_DIFFICULTY) {
  return (1 + (wave - 1) * 0.12 + past5(wave) * 0.08) * diffOf(difficulty).hp;
}

/* ---------- randomness ---------- */

/** Same LCG the other engines use. Deterministic per seed. */
export function rand(w) {
  return (w.seed = (Math.imul(w.seed, 1103515245) + 12345) & 0x7fffffff);
}

/* ---------- world ---------- */

export function createWorld(opts = {}) {
  const L = opts.layout || LAYOUT;
  const seed = opts.seed ?? 20260722;
  /* Route 1 unless asked otherwise. It used to come from the seed, which meant
     a first-time player's opening board was a coin toss between the gentlest
     route and the harshest — now the routes are ordered by difficulty and you
     start at the easy end, moving along one per replay. */
  const routeIndex = opts.routeIndex ?? 0;
  const difficulty = DIFFICULTIES[opts.difficulty] ? opts.difficulty : DEFAULT_DIFFICULTY;
  const D = diffOf(difficulty);
  const { path, pathLen } = buildPath(L, routeIndex);
  const w = {
    L, path, pathLen, routeIndex,
    blocked: pathCells(L, routeIndex),          // cells the route occupies
    towers: [],
    enemies: [],
    spawnQueue: [],                 // pending {type, at} for the active wave
    clock: 0,                       // seconds since the wave started spawning
    wave: 0,                        // 0 until the first wave starts
    waveActive: false,
    betweenWaves: true,
    difficulty,
    components: D.components,
    integrity: D.integrity,
    /* The armory. Lives on the world so the engine stays the only thing that
       resolves stats, but it is the *shell* that loads and saves it — the
       engine touches no storage, same rule as every other engine here. */
    classUpgrades: opts.classUpgrades || newClassUpgrades(),
    score: 0,
    over: false,
    won: false, justWon: false,
    /* Waves actually finished, as opposed to waves *started* — `wave` counts
       the latter and can run ahead of it, because waves overlap. This is what
       the win reads. */
    wavesCleared: 0,
    seed,
    fx: opts.fx || { kill() {}, leak() {}, shot() {}, build() {}, level() {} },
  };
  return w;
}

/** Start a fresh run. `routeIndex` and `difficulty` are the caller's choice —
 *  this used to advance the route by itself on every reset, which meant
 *  **losing promoted you to a harder board**. Failing route 1 and being handed
 *  route 2 is the opposite of what a difficulty ordering is for. Routes are
 *  earned now (see `recordWin`), and the shell decides which one to start. */
export function resetGame(w, opts = {}) {
  if (Number.isInteger(opts.routeIndex)) {
    w.routeIndex = ((opts.routeIndex % ROUTE_COUNT) + ROUTE_COUNT) % ROUTE_COUNT;
  }
  const { path, pathLen } = buildPath(w.L, w.routeIndex);
  w.path = path; w.pathLen = pathLen;
  w.blocked = pathCells(w.L, w.routeIndex);
  w.towers = []; w.enemies = []; w.spawnQueue = [];
  w.clock = 0; w.wave = 0; w.waveActive = false; w.betweenWaves = true;
  if (DIFFICULTIES[opts.difficulty]) w.difficulty = opts.difficulty;
  const D = diffOf(w.difficulty);
  w.components = D.components; w.integrity = D.integrity;
  w.score = 0; w.over = false;
  w.won = false; w.justWon = false; w.wavesCleared = 0;
  w.seed = 20260722;
  // classUpgrades deliberately survives: the armory is the thing that carries
  // between runs. Clearing it is a separate, explicit action in the menu.
}

/* ---------- building ---------- */

export function towerAt(w, c, r) {
  return w.towers.find(t => t.c === c && t.r === r) || null;
}

/** Can a tower of `type` go on this cell? Requires an on-grid, non-path, empty
 *  cell and enough components. */
export function canBuild(w, c, r, type) {
  if (w.over) return false;
  if (!inGrid(w.L, c, r)) return false;
  if (w.blocked.has(cellKey(c, r))) return false;
  if (towerAt(w, c, r)) return false;
  const T = TOWER_TYPES[type];
  return !!T && w.components >= T.cost;
}

export function buildTower(w, c, r, type) {
  if (!canBuild(w, c, r, type)) return false;
  w.components -= TOWER_TYPES[type].cost;
  w.towers.push({ c, r, type, level: 1, xp: 0, priority: 'first', cool: 0, aim: null });
  w.fx.build(c, r);
  return true;
}

/** Which enemy a tower prefers when several are in range. `first` (furthest
 *  along, nearest the core) is the sensible default; `last` holds the back of
 *  a pack so a Coil can slow arrivals before they bunch up; `strongest` is the
 *  answer to a Load or Tank walking past a wall of small guns. */
export const PRIORITIES = ['first', 'last', 'strongest'];

export function setPriority(w, i, priority) {
  const t = w.towers[i];
  if (!t || !PRIORITIES.includes(priority)) return false;
  t.priority = priority;
  return true;
}

export function sellTower(w, i) {
  const t = w.towers[i];
  if (!t) return false;
  w.components += sellValue(t);
  w.towers.splice(i, 1);
  return true;
}

/* ---------- moving a tower ---------- */

/** What it costs to pick a tower up and put it down somewhere else.
 *
 *  Exactly `sellValue` — the money a sell-and-rebuild would have burned. So
 *  moving is never a worse deal than the workaround it replaces, and it is
 *  never free either: without a fee the right play would be to drag the whole
 *  defense along behind every wave, which is busywork rather than a decision.
 *
 *  The tower keeps its level and XP. Those were earned by fighting, not bought,
 *  and making a move cost them would mean a well-sited veteran can never be
 *  re-sited — which is the exact situation a player wants this verb for. */
export function moveCost(tower) {
  return sellValue(tower);
}

/** Can this tower go to (c, r)? Same cell rules as building, plus the fee.
 *  Staying put is not a move, so it fails rather than quietly charging. */
export function canMove(w, i, c, r) {
  const t = w.towers[i];
  if (!t || w.over) return false;
  if (t.c === c && t.r === r) return false;
  if (!inGrid(w.L, c, r)) return false;
  if (w.blocked.has(cellKey(c, r))) return false;
  if (towerAt(w, c, r)) return false;
  return w.components >= moveCost(t);
}

/** Relocate a tower, charging the fee. Allowed mid-wave: the fee is the brake,
 *  and forbidding it during a wave would make it a chore rather than a tool —
 *  the moment you learn a placement is wrong is the moment it is being tested.
 *  The cooldown resets on arrival, so a move cannot be used to skip a reload. */
export function moveTower(w, i, c, r) {
  if (!canMove(w, i, c, r)) return false;
  const t = w.towers[i];
  w.components -= moveCost(t);
  t.c = c; t.r = r;
  t.cool = stats(w, t).rate;
  t.aim = null;                 // re-acquired next frame from the new cell
  w.fx.build(c, r);
  return true;
}

/* ---------- waves ---------- */

/** Begin the next wave. Queues its spawns onto a timeline; `step` releases them
 *  as their time comes due. Works mid-wave too: "start the next wave early"
 *  means exactly that — wave N+1's spawns are appended onto the existing
 *  queue, timed from right now, so both waves' enemies are on the board
 *  together, rather than N+1 queuing silently behind N. */
export function startWave(w) {
  if (w.over) return false;
  const overlapping = w.waveActive;
  w.wave++;
  const startAt = overlapping ? w.clock : 0;
  const spawns = [];
  // Each group opens partway through the one before it rather than waiting for
  // it to finish, so a wave arrives as a mixture instead of a queue.
  let groupAt = startAt;
  for (const g of wavePlan(w.wave)) {
    let t = groupAt;
    for (let i = 0; i < g.count; i++) { spawns.push({ type: g.type, at: t }); t += g.gap; }
    groupAt += Math.max(0.4, (t - groupAt) * GROUP_OVERLAP);
  }
  spawns.sort((a, b) => a.at - b.at);
  if (overlapping) {
    w.spawnQueue.push(...spawns);
    // spawn order by time, so interleaving groups (old wave + new) still
    // release correctly
    w.spawnQueue.sort((a, b) => a.at - b.at);
  } else {
    w.clock = 0;
    w.spawnQueue = spawns;
  }
  w.waveActive = true;
  w.betweenWaves = false;
  return true;
}

/** Pull the rest of the current wave forward, compressing the gaps between the
 *  spawns still queued. Each tap squeezes them again, so holding it empties
 *  the queue fast.
 *
 *  Restored after being deleted in v26, which assumed the new fast-forward
 *  covered it. It does not, and the difference is worth stating because it was
 *  got wrong once already: **fast-forward speeds up time, rush speeds up the
 *  enemy**. Under fast-forward your towers fire proportionally faster too, so
 *  the wave is exactly as hard and merely shorter — it is a convenience.
 *  Rushing leaves your towers at normal speed and sends the wave at you sooner,
 *  which is a real gamble taken for the bounty. They are different controls
 *  answering different wants, and both belong. */
export const RUSH_COMPRESSION = 0.55;

export function rushWave(w) {
  if (w.over || !w.waveActive || w.spawnQueue.length === 0) return false;
  for (const s of w.spawnQueue) {
    // compress toward *now*, never into the past
    s.at = w.clock + Math.max(0, s.at - w.clock) * RUSH_COMPRESSION;
  }
  return true;
}

/** Put an enemy on the path. `dist` defaults to the start, but a Tank
 *  deploying its cargo needs to place Swarm where the Tank currently is. */
function spawnEnemy(w, type, dist = 0) {
  const E = ENEMY_TYPES[type];
  const hp = Math.round(E.hp * hpScale(w.wave, w.difficulty));
  const e = { type, dist, hp, maxhp: hp, speed: E.speed, r: E.r, slow: 0 };
  // a deployer counts down to its next stop, then sits still while unloading
  if (E.deploys) { e.deployIn = E.deployEvery; e.stopFor = 0; }
  w.enemies.push(e);
}

/** Let a deployer out its cargo at its own position. Used both on the timer
 *  and, at half strength, when one is destroyed. */
function deployFrom(w, e, count) {
  const E = ENEMY_TYPES[e.type];
  if (!E.deploys) return 0;
  for (let i = 0; i < count; i++) {
    // fan them slightly back along the path so they don't stack into one
    // sprite, and never past the start
    spawnEnemy(w, E.deploys, Math.max(0, e.dist - i * 14));
  }
  return count;
}

/* ---------- targeting ---------- */

/** Position of an enemy in pixels. */
export function enemyPos(w, e) {
  return atS(w.path, w.pathLen, e.dist);
}

/** The enemy a tower should fire at, according to its `priority`. Each mode is
 *  just a different score to maximise over whatever is in range. */
function acquire(w, tower) {
  const c = cellCenter(w.L, tower.c, tower.r);
  const range = stats(w, tower).range;
  const mode = tower.priority || 'first';
  let best = null, bestKey = -Infinity;
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    const p = enemyPos(w, e);
    if (Math.hypot(p.x - c.x, p.y - c.y) > range) continue;
    const key = mode === 'last' ? -e.dist : mode === 'strongest' ? e.hp : e.dist;
    if (key > bestKey) { best = e; bestKey = key; }
  }
  return best;
}

/** How near an enemy has to be for a tower to look alive. A little past its
 *  firing range, so the barrel is already out by the time anything is worth
 *  shooting — the shell draws an idle tower as a bare ring, and this is what
 *  wakes it. Presentation only; nothing in the simulation reads it. */
export const READY_MARGIN = 46;
/** The margin again, for deciding a tower should go back to sleep. Bigger than
 *  the waking one on purpose: with a single threshold, an enemy sitting on the
 *  circle flipped the answer every frame and the barrel strobed in and out. Now
 *  waking and sleeping happen at different distances, so a target has to
 *  genuinely leave before the tower stands down. The shell pairs this with a
 *  hold timer — see `stepTowerArt`. */
export const READY_SLEEP_MARGIN = READY_MARGIN * 2.4;

/** Is anything within `margin` of this tower's range? Defaults to the waking
 *  margin, so existing callers are unchanged. */
export function towerReady(w, tower, margin = READY_MARGIN) {
  const c = cellCenter(w.L, tower.c, tower.r);
  const reach = stats(w, tower).range + margin;
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    const p = enemyPos(w, e);
    if (Math.hypot(p.x - c.x, p.y - c.y) <= reach) return true;
  }
  return false;
}

/** Apply a tower's shot: damage the target (plus splash), and slow if it slows.
 *  Kills are resolved here so bounty and fx fire immediately. The caller passes
 *  the target in — `step` already acquired one this frame for the barrel. */
function fireTower(w, tower, target) {
  if (!target) return;
  const s = stats(w, tower);

  const tc = cellCenter(w.L, tower.c, tower.r);
  w.fx.shot(tc.x, tc.y, target, tower.type);
  damageEnemy(w, target, s.dmg, s, false, tower);

  if (s.splash > 0) {
    const tp = enemyPos(w, target);
    for (const e of w.enemies) {
      if (e === target || e.hp <= 0) continue;
      const p = enemyPos(w, e);
      if (Math.hypot(p.x - tp.x, p.y - tp.y) <= s.splash) damageEnemy(w, e, s.dmg * 0.5, s, true, tower);
    }
  }
}

/** Resolve one hit. `isSplash` marks collateral damage, which some enemies
 *  shrug off. Order matters and is deliberate: the brittle bonus is read from
 *  the slow that was *already* on the target, so a Coil sets a target up for
 *  the next tower rather than for its own shot; splash resistance scales the
 *  incoming damage; and armor is flat, so it comes off last. */
function damageEnemy(w, e, dmg, s, isSplash = false, src = null) {
  if (e.hp <= 0) return;
  const T = ENEMY_TYPES[e.type];

  if (e.slow > 0) dmg *= SLOW_BRITTLE;
  if (isSplash && T.splashResist) dmg *= (1 - T.splashResist);
  if (T.armor) dmg = Math.max(MIN_DAMAGE, dmg - T.armor);

  const before = e.hp;
  e.hp -= dmg;

  /* XP is credited for damage that actually landed, not damage attempted —
     capped at the target's remaining health so overkill on a nearly-dead Surge
     is worth what it killed and no more. Otherwise a Breaker parked over the
     spawn would level on wasted splash. */
  if (src) {
    const dealt = Math.max(0, before - Math.max(0, e.hp));
    const rate = (XP_RATE[src.type] ?? 1) * (diffOf(w.difficulty).xp ?? 1);
    if (addXp(src, (dealt * XP_PER_DAMAGE + (e.hp <= 0 ? XP_KILL_BONUS : 0)) * rate)) {
      const c = cellCenter(w.L, src.c, src.r);
      w.fx.level?.(c.x, c.y, src);
    }
  }

  // a slowing tower stamps its strength and refreshes the timer — unless the
  // target is insulated, in which case Coil is simply the wrong pick here
  if (s.slow > 0 && !T.slowImmune) { e.slowStrength = s.slow; e.slow = s.slowDur; }
}

/** Patches repair whatever is near them. Applied to *other* enemies only, so a
 *  lone patch cannot heal itself into invulnerability. Never past full health. */
function stepHealers(w, dt) {
  for (const h of w.enemies) {
    const heals = ENEMY_TYPES[h.type].heals;
    if (!heals || h.hp <= 0) continue;
    const hp = enemyPos(w, h);
    for (const e of w.enemies) {
      if (e === h || e.hp <= 0 || e.hp >= e.maxhp) continue;
      const p = enemyPos(w, e);
      if (Math.hypot(p.x - hp.x, p.y - hp.y) <= HEAL_RADIUS) {
        e.hp = Math.min(e.maxhp, e.hp + heals * dt);
        e.healed = 0.2;            // brief flag so the shell can show the mend
      }
    }
  }
}

/* ---------- simulation step ---------- */

export function step(w, dt) {
  if (w.over) return;

  // release queued spawns whose time has come
  if (w.waveActive) {
    w.clock += dt;
    while (w.spawnQueue.length && w.spawnQueue[0].at <= w.clock) {
      spawnEnemy(w, w.spawnQueue.shift().type);
    }
  }

  /* Move enemies; a slowed enemy crawls, and a deployer periodically stops
     altogether to unload. Iterated by index because `deployFrom` pushes onto
     `w.enemies` — the new arrivals land past `i` and are skipped this frame,
     which is what we want (they start moving next frame, not from behind). */
  const movingCount = w.enemies.length;
  for (let i = 0; i < movingCount; i++) {
    const e = w.enemies[i];
    if (e.slow > 0) { e.slow = Math.max(0, e.slow - dt); }
    if (e.healed > 0) e.healed = Math.max(0, e.healed - dt);

    if (e.stopFor > 0) {           // halted, unloading — no forward progress
      e.stopFor = Math.max(0, e.stopFor - dt);
      continue;
    }
    if (e.deployIn !== undefined) {
      e.deployIn -= dt;
      if (e.deployIn <= 0) {
        const T = ENEMY_TYPES[e.type];
        deployFrom(w, e, T.deployCount);
        e.deployIn = T.deployEvery;
        e.stopFor = T.deployStop;
        continue;                  // the stop starts this frame
      }
    }

    let sp = e.speed;
    if (e.slow > 0) sp *= (1 - (e.slowStrength || 0));
    e.dist += sp * dt;
  }

  // repairs land before the towers fire, so a patch cannot undo damage dealt
  // this same frame — the player sees their shot land, then sees it mended
  stepHealers(w, dt);

  // towers fire on cooldown. Targets are acquired every frame, not just at the
  // instant a shot is allowed: `aim` is what the shell draws the barrel from,
  // so a tower tracks the current leader continuously instead of staying frozen
  // on whatever it last shot at (which may already be dead) until cooldown ends.
  for (const tower of w.towers) {
    tower.cool = Math.max(0, tower.cool - dt);
    const target = acquire(w, tower);
    tower.aim = target;
    if (target && tower.cool <= 0) {
      fireTower(w, tower, target);
      // read the rate *after* firing: a shot that levelled the tower should
      // reload at its new speed, not the one it had a moment ago
      tower.cool = stats(w, tower).rate;
    }
  }

  // resolve kills and leaks
  for (let i = w.enemies.length - 1; i >= 0; i--) {
    const e = w.enemies[i];
    if (e.hp <= 0) {
      /* Income is scaled by difficulty, score is not. Score has to stay
         comparable across a run's own history; what the difficulty changes is
         how much defense that run can afford, not what a kill was worth. */
      w.components += bountyOf(w, e.type);
      w.score += ENEMY_TYPES[e.type].bounty;
      const p = enemyPos(w, e);
      w.fx.kill(p.x, p.y, e.type);
      /* A deployer spills half a batch where it dies, so destroying one is
         never simply free — killing it deep in your defenses hands you the
         cargo somewhere awkward. Safe inside this backward loop: pushes land
         past `i`, which has already been visited. */
      const T = ENEMY_TYPES[e.type];
      if (T.deploys) deployFrom(w, e, Math.floor(T.deployCount / 2));
      w.enemies.splice(i, 1);
    } else if (e.dist >= w.pathLen) {
      w.integrity--;
      const p = enemyPos(w, e);
      w.fx.leak(p.x, p.y);
      w.enemies.splice(i, 1);
    }
  }

  if (w.integrity <= 0) { w.integrity = 0; w.over = true; return; }

  // wave clear: everything spawned and nothing left alive
  if (w.waveActive && w.spawnQueue.length === 0 && w.enemies.length === 0) {
    w.waveActive = false;
    w.betweenWaves = true;
    w.wavesCleared++;
    // surviving a wave pays a bonus that grows with the wave
    w.score += 20 + w.wave * 10;
  }

  /* Taking the circuit: you have reached the win wave and the board is clear.

     Deliberately a *state* check, not the wave-clear edge it was in v29. That
     edge was unreachable in practice: waves overlap (`startWave` works mid-wave
     and bumps `w.wave`), and with Auto on the shell opens the next wave the
     moment the current one stops spawning — so the board rarely empties, the
     edge rarely fires, and a player on Auto watched the counter sail past 50
     with nothing happening. Asking "am I at the wave, and is the board clear?"
     every frame cannot be missed by being on the wrong frame.

     It still requires genuinely clearing what is on the board, so it cannot be
     had by spamming Start Wave — and the shell stops auto-starting at the win
     wave, so the run is always given the chance to resolve.

     `justWon` is a one-frame edge for the shell; `won` stays set, so a player
     who keeps going is not congratulated again. */
  if (!w.won && w.wave >= winWave(w.difficulty)
      && w.spawnQueue.length === 0 && w.enemies.length === 0) {
    w.won = true; w.justWon = true;
  }
}

/* ---------- saving a run in progress ---------- */

/** A JSON-safe picture of a run. Deliberately *not* the whole world: `L`, `fx`,
 *  `path`, `pathLen` and `blocked` are all derived or injected, so they are
 *  rebuilt on the way back in rather than stored. `routeIndex` is stored because
 *  everything else derives from it — restore it wrong and every tower lands on
 *  the path. */
export function snapshot(w) {
  return {
    routeIndex: w.routeIndex,
    seed: w.seed,
    wave: w.wave, waveActive: w.waveActive, betweenWaves: w.betweenWaves,
    clock: w.clock,
    components: w.components, integrity: w.integrity, score: w.score,
    difficulty: w.difficulty,
    over: w.over,
    /* `won` is run state — it says this run has already taken its circuit, so
       a resumed one is not congratulated a second time. `justWon` is not: it is
       a one-frame edge for the shell, and restoring it would fire the victory
       banner again on the first frame back. */
    won: w.won,
    wavesCleared: w.wavesCleared,
    towers: w.towers.map(t => ({
      c: t.c, r: t.r, type: t.type, level: t.level, xp: t.xp,
      priority: t.priority, cool: t.cool,
    })),
    enemies: w.enemies.map(e => ({
      type: e.type, dist: e.dist, hp: e.hp, maxhp: e.maxhp, speed: e.speed, r: e.r,
      slow: e.slow, slowStrength: e.slowStrength,
    })),
    spawnQueue: w.spawnQueue.map(s => ({ type: s.type, at: s.at })),
  };
}

/** Restore a snapshot onto an existing world, in place. Returns false and
 *  changes nothing if the snapshot is unusable, so a corrupt save degrades to
 *  "start a new run" rather than to a broken one. */
export function hydrate(w, snap) {
  if (!snap || typeof snap !== 'object') return false;
  if (!Array.isArray(snap.towers) || !Array.isArray(snap.enemies)) return false;
  if (typeof snap.routeIndex !== 'number') return false;
  // a tower of a type this build no longer has would break every lookup
  if (snap.towers.some(t => !TOWER_TYPES[t.type])) return false;
  if (snap.enemies.some(e => !ENEMY_TYPES[e.type])) return false;

  w.routeIndex = ((snap.routeIndex % ROUTE_COUNT) + ROUTE_COUNT) % ROUTE_COUNT;
  const { path, pathLen } = buildPath(w.L, w.routeIndex);
  w.path = path; w.pathLen = pathLen;
  w.blocked = pathCells(w.L, w.routeIndex);

  w.seed = snap.seed ?? w.seed;
  w.wave = snap.wave ?? 0;
  w.waveActive = !!snap.waveActive;
  w.betweenWaves = snap.betweenWaves ?? true;
  w.clock = snap.clock ?? 0;
  if (DIFFICULTIES[snap.difficulty]) w.difficulty = snap.difficulty;
  const D = diffOf(w.difficulty);
  // `charge` is the pre-v27 name for the same field. Reading both means a run
  // saved on the old build resumes with its money instead of silently at zero.
  w.components = snap.components ?? snap.charge ?? D.components;
  w.integrity = snap.integrity ?? D.integrity;
  w.score = snap.score ?? 0;
  w.over = !!snap.over;
  w.won = !!snap.won; w.justWon = false;
  // pre-v30 saves have no count; fall back to the wave number, which is the
  // closest thing they carry and never under-reports a finished run
  w.wavesCleared = snap.wavesCleared ?? Math.max(0, (snap.wave ?? 1) - 1);

  /* `aim` is rebuilt: it points at a live enemy object, and object identity
     cannot survive JSON. Safe to drop because `step` re-acquires every frame.
     `tier` is the pre-v27 shape — a 0-2 manual upgrade level. Towers level
     themselves now, so an old save's tier is read as a starting level rather
     than thrown away; a tier-2 tower comes back as a level-3 one. */
  w.towers = snap.towers.map(t => ({
    c: t.c, r: t.r, type: t.type,
    level: Math.min(MAX_LEVEL, Math.max(1, t.level ?? ((t.tier ?? 0) + 1))),
    xp: t.xp ?? 0,
    priority: PRIORITIES.includes(t.priority) ? t.priority : 'first',
    cool: t.cool || 0, aim: null,
  }));
  w.enemies = snap.enemies.map(e => ({ ...e, healed: 0 }));
  w.spawnQueue = snap.spawnQueue ? snap.spawnQueue.map(s => ({ type: s.type, at: s.at })) : [];
  return true;
}

/* ---------- rotation ---------- */

/** Move an in-progress game onto the other layout, as when the phone is turned.
 *
 *  Lossless: the layouts are exact transposes, so towers map (c, r) -> (r, c)
 *  and the path is the same length, so every enemy's `dist` carries over
 *  untouched — as do components, integrity, wave and score. Turning the phone turns
 *  the board, which is also the least surprising thing that could happen. Same
 *  approach as Feedline. */
export function relayout(w, L2) {
  // the run's own circuit has to come across too — rebuilding at route 0 would
  // silently swap the board mid-run and strand every tower off the new path
  const { path, pathLen } = buildPath(L2, w.routeIndex);
  w.L = L2;
  w.path = path; w.pathLen = pathLen;
  w.blocked = pathCells(L2, w.routeIndex);
  for (const t of w.towers) { const c = t.c, r = t.r; t.c = r; t.r = c; }
  return w;
}
