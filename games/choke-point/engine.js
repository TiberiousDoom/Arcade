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
 *  with no rescaling. See `relayout`, and Drift Net for the same trick. */
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
 *  is a different defence problem rather than the same one faster.
 *
 *  Transposing each (swap every pair) yields a valid portrait route by
 *  construction, since the grid dimensions swap too, and because cells are
 *  square the transposed path has an identical length. That is what keeps
 *  rotation lossless — see `relayout`. */
const ROUTES = [
  // A: three long sweeps, doubling back — the original. Plenty of cells that
  // cover two lanes at once, so it rewards finding the pinch points.
  [[0, 1], [9, 1], [9, 3], [2, 3], [2, 5], [11, 5], [11, 7]],
  // B: enters low and climbs, then descends in steps. Longer and more wound,
  // so there is more time on the board but the lanes are further apart.
  [[0, 6], [10, 6], [10, 1], [3, 1], [3, 4], [7, 4], [7, 7], [11, 7]],
  // C: fewer turns and long straights. Shortest of the three, so less time to
  // kill, but the straights concentrate fire nicely.
  [[0, 0], [8, 0], [8, 4], [1, 4], [1, 7], [11, 7]],
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

/** Build the polyline through the route's cell centres, tagging each vertex
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

/** Three tower types. `stats(type, tier)` resolves the effective numbers; read
 *  from that, not these tables directly. Ranges are in pixels; rate is seconds
 *  between shots; slow is a fraction and duration in seconds. */
export const TOWER_TYPES = {
  node: {
    name: 'Node', cost: 12, col: '#6fb7e8', blurb: 'Cheap, fast, low damage',
    tiers: [
      { range: 92, rate: 0.5, dmg: 4, splash: 0, slow: 0 },
      { range: 104, rate: 0.42, dmg: 6, splash: 0, slow: 0 },
      { range: 116, rate: 0.36, dmg: 9, splash: 0, slow: 0 },
    ],
  },
  breaker: {
    name: 'Breaker', cost: 32, col: '#e0503c', blurb: 'Slow, heavy, small splash',
    tiers: [
      { range: 120, rate: 1.4, dmg: 24, splash: 44, slow: 0 },
      { range: 132, rate: 1.25, dmg: 38, splash: 50, slow: 0 },
      { range: 146, rate: 1.1, dmg: 58, splash: 58, slow: 0 },
    ],
  },
  coil: {
    name: 'Coil', cost: 20, col: '#5fc9a4', blurb: 'Slows, and softens for others',
    tiers: [
      { range: 84, rate: 0.8, dmg: 2, splash: 0, slow: 0.4, slowDur: 1.2 },
      { range: 92, rate: 0.72, dmg: 3, splash: 0, slow: 0.5, slowDur: 1.4 },
      { range: 100, rate: 0.64, dmg: 4, splash: 0, slow: 0.6, slowDur: 1.6 },
    ],
  },
};
export const TOWER_KEYS = Object.keys(TOWER_TYPES);
export const MAX_TIER = 2;   // index of the last tier (0-based); three tiers total

/** Cost of the next upgrade for a tower, or null if maxed. Scales off the base
 *  cost so pricier towers cost more to level. */
export function upgradeCost(tower) {
  if (tower.tier >= MAX_TIER) return null;
  return Math.round(TOWER_TYPES[tower.type].cost * (1.4 + tower.tier * 0.9));
}

/** Charge returned when a tower is sold: half of everything sunk into it. */
export function sellValue(tower) {
  const T = TOWER_TYPES[tower.type];
  let spent = T.cost;
  for (let t = 0; t < tower.tier; t++) spent += Math.round(T.cost * (1.4 + t * 0.9));
  return Math.floor(spent * 0.5);
}

/** Effective stats for a tower's current tier. */
export function stats(tower) {
  return TOWER_TYPES[tower.type].tiers[tower.tier];
}

/* ---------- enemies ---------- */

/** Base speed a surge covers in pixels per second. Flat, not scaled by board
 *  size: because both layouts share a path length, a flat speed already gives
 *  the same crossing time either way. */
/*  Enemies used to differ only in hp, speed and bounty, which meant there was
 *  never a reason to build a *mix* of towers — more of whatever was strongest
 *  was always correct. These traits exist to make specific towers the wrong
 *  answer, so a defence has to cover several cases:
 *
 *    armor        flat reduction on every hit, so many weak shots (Node) are
 *                 wasted and few heavy ones (Breaker) are right
 *    splashResist takes only part of splash damage — the mirror case, where
 *                 Breaker's area damage is the wrong tool
 *    slowImmune   Coil cannot slow it, so it cannot be set up for `brittle`
 *    heals        repairs nearby enemies, which makes target priority matter
 *                 rather than just total damage
 */
export const ENEMY_TYPES = {
  surge: { name: 'Surge', hp: 20, speed: 62, bounty: 3, r: 12, col: '#e6e9e2' },
  spark: { name: 'Spark', hp: 12, speed: 112, bounty: 4, r: 10, col: '#c9a227' },
  load:  { name: 'Load',  hp: 92, speed: 40, bounty: 8, r: 15, col: '#7f8fa0' },
  // many, tiny and quick: the case splash damage is *for*
  swarm: { name: 'Swarm', hp: 7, speed: 128, bounty: 2, r: 8, col: '#d8763a' },
  // plated: chips a flat amount off every hit, so a tier-0 Node barely dents it
  // while a Breaker hardly notices. Deliberately 3 and not higher — at 6 it
  // exceeded Node's base damage outright, which made Node permanently useless
  // here rather than something worth *upgrading* to make viable.
  shell: { name: 'Shell', hp: 70, speed: 46, bounty: 11, r: 15, col: '#4d7fb3', armor: 3 },
  // insulated against splash, and quick — punish leaning on Breaker
  phase: { name: 'Phase', hp: 34, speed: 104, bounty: 9, r: 11, col: '#b58fd0',
           splashResist: 0.8, slowImmune: true },
  // repairs its neighbours. Towers shoot the furthest-along enemy, so a patch
  // trailing the pack is safe unless you build to reach it.
  patch: { name: 'Patch', hp: 44, speed: 54, bounty: 10, r: 13, col: '#5fc9a4', heals: 7 },
};
export const ENEMY_KEYS = Object.keys(ENEMY_TYPES);

/** How far a Patch's repair reaches, in pixels. */
export const HEAL_RADIUS = 96;
/** No hit is ever fully absorbed — armour caps out at leaving this through. */
export const MIN_DAMAGE = 1;
/** A slowed enemy takes this much extra damage. This is what makes Coil worth
 *  building: on its own it barely scratches anything, but it sets targets up
 *  for everything else, so it becomes a support piece rather than a weak gun. */
export const SLOW_BRITTLE = 1.4;

/* ---------- waves ---------- */

export const START_CHARGE = 55;
export const START_INTEGRITY = 20;

/** Deterministic composition of a wave: a list of spawn groups, each a type,
 *  a count, and the gap in seconds between spawns. Escalates forever, and
 *  introduces the tougher types at thresholds. HP and counts climb with the
 *  wave; the shell scales enemy hp via `hpScale`. */
/** The wave each enemy type first appears on. One new idea at a time, so each
 *  trait can be met and understood on its own rather than all at once — same
 *  reasoning as Flak Battery's KIND_UNLOCK. */
export const ENEMY_UNLOCK = {
  surge: 1, spark: 3, swarm: 4, load: 5, shell: 7, phase: 9, patch: 11,
};

/** Types available on a given wave, in unlock order. */
export function enemiesForWave(wave) {
  return ENEMY_KEYS.filter(k => wave >= ENEMY_UNLOCK[k]);
}

export function wavePlan(wave) {
  const groups = [{ type: 'surge', count: 6 + wave * 2, gap: 0.7 }];
  if (wave >= ENEMY_UNLOCK.spark) groups.push({ type: 'spark', count: 3 + Math.floor(wave / 2), gap: 0.45 });
  // swarms come in a tight burst — that clustering is what makes splash pay
  if (wave >= ENEMY_UNLOCK.swarm) groups.push({ type: 'swarm', count: 6 + wave, gap: 0.16 });
  if (wave >= ENEMY_UNLOCK.load) groups.push({ type: 'load', count: 1 + Math.floor((wave - 5) / 2), gap: 1.1 });
  if (wave >= ENEMY_UNLOCK.shell) groups.push({ type: 'shell', count: 1 + Math.floor((wave - 7) / 3), gap: 1.3 });
  if (wave >= ENEMY_UNLOCK.phase) groups.push({ type: 'phase', count: 2 + Math.floor((wave - 9) / 2), gap: 0.6 });
  // one patch at a time: two would heal each other and stall the wave
  if (wave >= ENEMY_UNLOCK.patch) groups.push({ type: 'patch', count: 1, gap: 1.5 });
  return groups;
}

/** Enemy hp is multiplied by this, so late waves stay threatening without new
 *  tables. Roughly +12% a wave. */
export function hpScale(wave) {
  return 1 + (wave - 1) * 0.12;
}

/* ---------- randomness ---------- */

/** Same LCG the other engines use. Deterministic per seed. */
export function rand(w) {
  return (w.seed = (w.seed * 1103515245 + 12345) & 0x7fffffff);
}

/* ---------- world ---------- */

export function createWorld(opts = {}) {
  const L = opts.layout || LAYOUT;
  const seed = opts.seed ?? 20260722;
  // which circuit this run uses. Derived from the seed rather than rolled, so a
  // seed still replays a run exactly — the route is part of what a seed means.
  const routeIndex = opts.routeIndex ?? (Math.abs(seed) % ROUTE_COUNT);
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
    charge: START_CHARGE,
    integrity: START_INTEGRITY,
    score: 0,
    over: false,
    seed,
    fx: opts.fx || { kill() {}, leak() {}, shot() {}, build() {} },
  };
  return w;
}

export function resetGame(w) {
  // Play again gets the *next* circuit, not the same one. Cycling rather than
  // rolling keeps it deterministic while making a replay a different board,
  // which is the whole point of having more than one.
  w.routeIndex = (w.routeIndex + 1) % ROUTE_COUNT;
  const { path, pathLen } = buildPath(w.L, w.routeIndex);
  w.path = path; w.pathLen = pathLen;
  w.blocked = pathCells(w.L, w.routeIndex);
  w.towers = []; w.enemies = []; w.spawnQueue = [];
  w.clock = 0; w.wave = 0; w.waveActive = false; w.betweenWaves = true;
  w.charge = START_CHARGE; w.integrity = START_INTEGRITY;
  w.score = 0; w.over = false;
  w.seed = 20260722;
}

/* ---------- building ---------- */

export function towerAt(w, c, r) {
  return w.towers.find(t => t.c === c && t.r === r) || null;
}

/** Can a tower of `type` go on this cell? Requires an on-grid, non-path, empty
 *  cell and enough charge. */
export function canBuild(w, c, r, type) {
  if (w.over) return false;
  if (!inGrid(w.L, c, r)) return false;
  if (w.blocked.has(cellKey(c, r))) return false;
  if (towerAt(w, c, r)) return false;
  const T = TOWER_TYPES[type];
  return !!T && w.charge >= T.cost;
}

export function buildTower(w, c, r, type) {
  if (!canBuild(w, c, r, type)) return false;
  w.charge -= TOWER_TYPES[type].cost;
  w.towers.push({ c, r, type, tier: 0, cool: 0, aim: null });
  w.fx.build(c, r);
  return true;
}

export function upgradeTower(w, i) {
  const t = w.towers[i];
  if (!t) return false;
  const cost = upgradeCost(t);
  if (cost === null || w.charge < cost) return false;
  w.charge -= cost;
  t.tier++;
  return true;
}

export function sellTower(w, i) {
  const t = w.towers[i];
  if (!t) return false;
  w.charge += sellValue(t);
  w.towers.splice(i, 1);
  return true;
}

/* ---------- waves ---------- */

/** Begin the next wave. Queues its spawns onto a timeline; `step` releases them
 *  as their time comes due. No-op while a wave is already running. */
export function startWave(w) {
  if (w.over || w.waveActive) return false;
  w.wave++;
  w.clock = 0;
  w.spawnQueue = [];
  let t = 0;
  for (const g of wavePlan(w.wave)) {
    for (let i = 0; i < g.count; i++) { w.spawnQueue.push({ type: g.type, at: t }); t += g.gap; }
    t += 0.6;   // a breath between groups
  }
  // spawn order by time, so interleaving groups still release correctly
  w.spawnQueue.sort((a, b) => a.at - b.at);
  w.waveActive = true;
  w.betweenWaves = false;
  return true;
}

function spawnEnemy(w, type) {
  const E = ENEMY_TYPES[type];
  const hp = Math.round(E.hp * hpScale(w.wave));
  w.enemies.push({ type, dist: 0, hp, maxhp: hp, speed: E.speed, r: E.r, slow: 0 });
}

/* ---------- targeting ---------- */

/** Position of an enemy in pixels. */
export function enemyPos(w, e) {
  return atS(w.path, w.pathLen, e.dist);
}

/** The enemy a tower should fire at: the one furthest along the path (closest
 *  to the core) within range. Prioritising leaders is the sensible default. */
function acquire(w, tower) {
  const c = cellCenter(w.L, tower.c, tower.r);
  const range = stats(tower).range;
  let best = null, bestDist = -1;
  for (const e of w.enemies) {
    const p = enemyPos(w, e);
    if (Math.hypot(p.x - c.x, p.y - c.y) <= range && e.dist > bestDist) {
      best = e; bestDist = e.dist;
    }
  }
  return best;
}

/** Apply a tower's shot: damage the target (plus splash), and slow if it slows.
 *  Kills are resolved here so bounty and fx fire immediately. The caller passes
 *  the target in — `step` already acquired one this frame for the barrel. */
function fireTower(w, tower, target) {
  const s = stats(tower);
  if (!target) return;

  const tc = cellCenter(w.L, tower.c, tower.r);
  w.fx.shot(tc.x, tc.y, target, tower.type);
  damageEnemy(w, target, s.dmg, s);

  if (s.splash > 0) {
    const tp = enemyPos(w, target);
    for (const e of w.enemies) {
      if (e === target || e.hp <= 0) continue;
      const p = enemyPos(w, e);
      if (Math.hypot(p.x - tp.x, p.y - tp.y) <= s.splash) damageEnemy(w, e, s.dmg * 0.5, s, true);
    }
  }
}

/** Resolve one hit. `isSplash` marks collateral damage, which some enemies
 *  shrug off. Order matters and is deliberate: the brittle bonus is read from
 *  the slow that was *already* on the target, so a Coil sets a target up for
 *  the next tower rather than for its own shot; splash resistance scales the
 *  incoming damage; and armour is flat, so it comes off last. */
function damageEnemy(w, e, dmg, s, isSplash = false) {
  if (e.hp <= 0) return;
  const T = ENEMY_TYPES[e.type];

  if (e.slow > 0) dmg *= SLOW_BRITTLE;
  if (isSplash && T.splashResist) dmg *= (1 - T.splashResist);
  if (T.armor) dmg = Math.max(MIN_DAMAGE, dmg - T.armor);

  e.hp -= dmg;

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

  // move enemies; a slowed enemy crawls
  for (const e of w.enemies) {
    let sp = e.speed;
    if (e.slow > 0) { e.slow = Math.max(0, e.slow - dt); sp *= (1 - (e.slowStrength || 0)); }
    if (e.healed > 0) e.healed = Math.max(0, e.healed - dt);
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
      tower.cool = stats(tower).rate;
    }
  }

  // resolve kills and leaks
  for (let i = w.enemies.length - 1; i >= 0; i--) {
    const e = w.enemies[i];
    if (e.hp <= 0) {
      w.charge += ENEMY_TYPES[e.type].bounty;
      w.score += ENEMY_TYPES[e.type].bounty;
      const p = enemyPos(w, e);
      w.fx.kill(p.x, p.y, e.type);
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
    // surviving a wave pays a bonus that grows with the wave
    w.score += 20 + w.wave * 10;
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
    charge: w.charge, integrity: w.integrity, score: w.score,
    over: w.over,
    towers: w.towers.map(t => ({ c: t.c, r: t.r, type: t.type, tier: t.tier, cool: t.cool })),
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
  w.charge = snap.charge ?? START_CHARGE;
  w.integrity = snap.integrity ?? START_INTEGRITY;
  w.score = snap.score ?? 0;
  w.over = !!snap.over;

  // `aim` is rebuilt: it points at a live enemy object, and object identity
  // cannot survive JSON. Safe to drop because `step` re-acquires every frame.
  w.towers = snap.towers.map(t => ({ c: t.c, r: t.r, type: t.type, tier: t.tier, cool: t.cool || 0, aim: null }));
  w.enemies = snap.enemies.map(e => ({ ...e, healed: 0 }));
  w.spawnQueue = snap.spawnQueue ? snap.spawnQueue.map(s => ({ type: s.type, at: s.at })) : [];
  return true;
}

/* ---------- rotation ---------- */

/** Move an in-progress game onto the other layout, as when the phone is turned.
 *
 *  Lossless: the layouts are exact transposes, so towers map (c, r) -> (r, c)
 *  and the path is the same length, so every enemy's `dist` carries over
 *  untouched — as do charge, integrity, wave and score. Turning the phone turns
 *  the board, which is also the least surprising thing that could happen. Same
 *  approach as Drift Net. */
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
