/* Circuit Breaker — pure logic core.
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
 *  with no rescaling. See `relayout`, and Live Wire for the same trick. */
export const CELL = 52;

/** The circuit path, as a list of [col, row] waypoints in landscape space.
 *  Enters top-left, snakes across, and ends at the core on the right edge.
 *  Transposing (swap each pair) yields a valid portrait route by construction,
 *  since the grid dimensions swap too. Kept within a 15x10 grid. */
const ROUTE = [
  [0, 1], [12, 1], [12, 4], [2, 4], [2, 7], [13, 7], [13, 9],
];

export const LAYOUT = {
  COLS: 15, ROWS: 10, CELL,
  route: ROUTE,
  get W() { return this.COLS * this.CELL; },
  get H() { return this.ROWS * this.CELL; },
};

/** Portrait phones get the exact transpose — same cells, same route, stood on
 *  its end. Keep these mirrored; `relayout` and a test both rely on it. */
export const LAYOUT_TALL = {
  COLS: LAYOUT.ROWS, ROWS: LAYOUT.COLS, CELL,
  route: ROUTE.map(([c, r]) => [r, c]),
  get W() { return this.COLS * this.CELL; },
  get H() { return this.ROWS * this.CELL; },
};

export const cellCenter = (L, c, r) => ({ x: (c + 0.5) * L.CELL, y: (r + 0.5) * L.CELL });
export const inGrid = (L, c, r) => c >= 0 && r >= 0 && c < L.COLS && r < L.ROWS;
export const cellKey = (c, r) => c + ',' + r;

/** The cell under a pixel, or null if off the grid. */
export function cellAt(L, px, py) {
  const c = Math.floor(px / L.CELL), r = Math.floor(py / L.CELL);
  return inGrid(L, c, r) ? { c, r } : null;
}

/* ---------- path geometry (same arc-length model as Serpent Battery) ---------- */

/** Build the polyline through the route's cell centres, tagging each vertex
 *  with cumulative arc-length `s`. Returns the points and the total length. */
export function buildPath(L) {
  const pts = L.route.map(([c, r]) => cellCenter(L, c, r));
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
export function pathCells(L) {
  const set = new Set();
  for (let i = 1; i < L.route.length; i++) {
    let [c0, r0] = L.route[i - 1];
    const [c1, r1] = L.route[i];
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
    name: 'Coil', cost: 20, col: '#5fc9a4', blurb: 'Slows what it hits',
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
export const ENEMY_TYPES = {
  surge: { name: 'Surge', hp: 20, speed: 62, bounty: 3, r: 12, col: '#e6e9e2' },
  spark: { name: 'Spark', hp: 12, speed: 112, bounty: 4, r: 10, col: '#c9a227' },
  load:  { name: 'Load',  hp: 92, speed: 40, bounty: 8, r: 15, col: '#7f8fa0' },
};

/* ---------- waves ---------- */

export const START_CHARGE = 55;
export const START_INTEGRITY = 20;

/** Deterministic composition of a wave: a list of spawn groups, each a type,
 *  a count, and the gap in seconds between spawns. Escalates forever, and
 *  introduces the tougher types at thresholds. HP and counts climb with the
 *  wave; the shell scales enemy hp via `hpScale`. */
export function wavePlan(wave) {
  const groups = [{ type: 'surge', count: 6 + wave * 2, gap: 0.7 }];
  if (wave >= 3) groups.push({ type: 'spark', count: 3 + Math.floor(wave / 2), gap: 0.45 });
  if (wave >= 5) groups.push({ type: 'load', count: 1 + Math.floor((wave - 5) / 2), gap: 1.1 });
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
  const { path, pathLen } = buildPath(L);
  const w = {
    L, path, pathLen,
    blocked: pathCells(L),          // cells the route occupies
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
    seed: opts.seed ?? 20260722,
    fx: opts.fx || { kill() {}, leak() {}, shot() {}, build() {} },
  };
  return w;
}

export function resetGame(w) {
  const { path, pathLen } = buildPath(w.L);
  w.path = path; w.pathLen = pathLen;
  w.blocked = pathCells(w.L);
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
 *  Kills are resolved here so bounty and fx fire immediately. */
function fireTower(w, tower) {
  const s = stats(tower);
  const target = acquire(w, tower);
  tower.aim = target;
  if (!target) return;

  const tc = cellCenter(w.L, tower.c, tower.r);
  w.fx.shot(tc.x, tc.y, target, tower.type);
  damageEnemy(w, target, s.dmg, s);

  if (s.splash > 0) {
    const tp = enemyPos(w, target);
    for (const e of w.enemies) {
      if (e === target || e.hp <= 0) continue;
      const p = enemyPos(w, e);
      if (Math.hypot(p.x - tp.x, p.y - tp.y) <= s.splash) damageEnemy(w, e, s.dmg * 0.5, s);
    }
  }
}

function damageEnemy(w, e, dmg, s) {
  if (e.hp <= 0) return;
  e.hp -= dmg;
  // a slowing tower stamps its strength and refreshes the timer
  if (s.slow > 0) { e.slowStrength = s.slow; e.slow = s.slowDur; }
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
    e.dist += sp * dt;
  }

  // towers fire on cooldown
  for (const tower of w.towers) {
    tower.cool = Math.max(0, tower.cool - dt);
    if (tower.cool <= 0) {
      const hadTarget = acquire(w, tower);
      if (hadTarget) { fireTower(w, tower); tower.cool = stats(tower).rate; }
      else tower.aim = null;
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

/* ---------- rotation ---------- */

/** Move an in-progress game onto the other layout, as when the phone is turned.
 *
 *  Lossless: the layouts are exact transposes, so towers map (c, r) -> (r, c)
 *  and the path is the same length, so every enemy's `dist` carries over
 *  untouched — as do charge, integrity, wave and score. Turning the phone turns
 *  the board, which is also the least surprising thing that could happen. Same
 *  approach as Live Wire. */
export function relayout(w, L2) {
  const { path, pathLen } = buildPath(L2);
  w.L = L2;
  w.path = path; w.pathLen = pathLen;
  w.blocked = pathCells(L2);
  for (const t of w.towers) { const c = t.c, r = t.r; t.c = r; t.r = c; }
  return w;
}
