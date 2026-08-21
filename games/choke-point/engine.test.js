import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.js';

const L = E.LAYOUT;
const TALL = E.LAYOUT_TALL;

/** A world with plenty of components, so building isn't the thing under test. */
function richWorld(opts = {}) {
  const w = E.createWorld(opts);
  w.components = 9999;
  return w;
}

/** The first buildable (non-path) cell found, for tests that just need one. */
function firstBuildable(w) {
  for (let r = 0; r < w.L.ROWS; r++)
    for (let c = 0; c < w.L.COLS; c++)
      if (!w.blocked.has(E.cellKey(c, r))) return { c, r };
  throw new Error('no buildable cell');
}

/* ---------- board & transpose invariant ---------- */

test('board dimensions derive from the grid', () => {
  assert.equal(L.W, L.COLS * L.CELL);
  assert.equal(L.H, L.ROWS * L.CELL);
});

test('the two layouts are exact transposes — what rotation rests on', () => {
  assert.equal(TALL.COLS, L.ROWS);
  assert.equal(TALL.ROWS, L.COLS);
  assert.equal(TALL.CELL, L.CELL);
  assert.equal(TALL.COLS * TALL.ROWS, L.COLS * L.ROWS, 'same cell count');
  // the routes are transposes cell for cell
  L.route.forEach(([c, r], i) => {
    assert.deepEqual(TALL.route[i], [r, c], `route point ${i} is transposed`);
  });
});

test('both layouts have the same path length, so enemy distance carries over', () => {
  const a = E.buildPath(L), b = E.buildPath(TALL);
  assert.ok(Math.abs(a.pathLen - b.pathLen) < 1e-9, `${a.pathLen} vs ${b.pathLen}`);
});

test('the route stays inside both grids', () => {
  for (const [c, r] of L.route) assert.ok(E.inGrid(L, c, r), `${c},${r} in landscape`);
  for (const [c, r] of TALL.route) assert.ok(E.inGrid(TALL, c, r), `${c},${r} in portrait`);
});

/* ---------- every route, not just the default one ---------- */

test('every route is legal on both layouts and transposes exactly', () => {
  for (let i = 0; i < E.ROUTE_COUNT; i++) {
    const land = E.routeAt(L, i), tall = E.routeAt(TALL, i);
    assert.equal(land.length, tall.length, `route ${i} same shape both ways`);

    land.forEach(([c, r], k) => {
      assert.ok(E.inGrid(L, c, r), `route ${i} point ${k} (${c},${r}) is on the landscape grid`);
      assert.deepEqual(tall[k], [r, c], `route ${i} point ${k} is transposed`);
      assert.ok(E.inGrid(TALL, r, c), `route ${i} point ${k} is on the portrait grid`);
    });

    // pathCells walks a cell at a time between waypoints, so each leg must
    // change exactly one coordinate — a diagonal would silently skip cells
    for (let k = 1; k < land.length; k++) {
      const [c0, r0] = land[k - 1], [c1, r1] = land[k];
      const movedC = c0 !== c1, movedR = r0 !== r1;
      assert.ok(movedC !== movedR, `route ${i} leg ${k} is axis-aligned`);
    }
  }
});

test('each route is the same length on both layouts, so rotation stays lossless', () => {
  for (let i = 0; i < E.ROUTE_COUNT; i++) {
    const a = E.buildPath(L, i), b = E.buildPath(TALL, i);
    assert.ok(Math.abs(a.pathLen - b.pathLen) < 1e-9, `route ${i}: ${a.pathLen} vs ${b.pathLen}`);
  }
});

test('the routes are genuinely different boards, each with room to build', () => {
  const seen = new Set();
  for (let i = 0; i < E.ROUTE_COUNT; i++) {
    const cells = E.pathCells(L, i);
    seen.add([...cells].sort().join('|'));
    const buildable = L.COLS * L.ROWS - cells.size;
    assert.ok(buildable > 40, `route ${i} leaves ${buildable} buildable cells`);
  }
  assert.equal(seen.size, E.ROUTE_COUNT, 'no two routes occupy the same cells');
  assert.ok(E.ROUTE_COUNT >= 3, 'enough routes for replay to feel different');
});

test('every run starts on route 1, whatever the seed', () => {
  // It used to be derived from the seed, which made a first-timer's opening
  // board a coin toss between the gentlest route and the harshest.
  assert.equal(E.createWorld({ seed: 5 }).routeIndex, 0);
  assert.equal(E.createWorld({ seed: 999999 }).routeIndex, 0);
  assert.equal(E.createWorld({ routeIndex: 2 }).routeIndex, 2, 'but it can still be forced');
  // the world's path really is the chosen route's, not always route 0
  const w = E.createWorld({ routeIndex: 1 });
  assert.ok(Math.abs(w.pathLen - E.buildPath(L, 1).pathLen) < 1e-9);
  assert.deepEqual([...w.blocked].sort(), [...E.pathCells(L, 1)].sort());
});

test('the routes run longest to shortest, which is the difficulty order', () => {
  // Length is time under fire, so route 1 is the most forgiving and route 3
  // the least. Stated as a requirement, so pinned rather than left to drift.
  const lens = [];
  for (let i = 0; i < E.ROUTE_COUNT; i++) lens.push(E.buildPath(L, i).pathLen);
  for (let i = 1; i < lens.length; i++) {
    assert.ok(lens[i] < lens[i - 1], `route ${i + 1} (${lens[i]}) should be shorter than route ${i} (${lens[i - 1]})`);
  }
  assert.ok(lens[0] > lens[lens.length - 1] * 2, 'and the spread is wide enough to feel');
});

test('losing keeps you on the same circuit', () => {
  /* It used to advance on every reset, so *failing* route 1 promoted you to
     the harder route 2 — the exact opposite of what ordering them by difficulty
     is for. The caller picks the circuit now. */
  const w = E.createWorld({ routeIndex: 0 });
  E.resetGame(w);
  assert.equal(w.routeIndex, 0, 'a replay is the board you did not beat');
  assert.deepEqual([...w.blocked].sort(), [...E.pathCells(w.L, 0)].sort());
});

test('a reset goes to the circuit it is told to, and wraps rather than running off', () => {
  const w = E.createWorld({ routeIndex: 0 });
  E.resetGame(w, { routeIndex: 1 });
  assert.equal(w.routeIndex, 1);
  assert.deepEqual([...w.blocked].sort(), [...E.pathCells(w.L, 1)].sort(), 'blocked cells followed');
  E.resetGame(w, { routeIndex: E.ROUTE_COUNT });
  assert.equal(w.routeIndex, 0);
  E.resetGame(w, { routeIndex: -1 });
  assert.equal(w.routeIndex, E.ROUTE_COUNT - 1, 'negative wraps too');
});

test('rotating mid-run keeps the run on its own circuit', () => {
  // regression: relayout rebuilt at route 0, which would swap the board
  // underneath the player and strand every tower off the path
  const w = richWorld({ routeIndex: 2 });
  const cell = firstBuildable(w);
  E.buildTower(w, cell.c, cell.r, 'node');
  E.relayout(w, TALL);
  assert.equal(w.routeIndex, 2, 'still the same circuit');
  assert.deepEqual([...w.blocked].sort(), [...E.pathCells(TALL, 2)].sort());
  const t = w.towers[0];
  assert.ok(!w.blocked.has(E.cellKey(t.c, t.r)), 'the tower did not end up on the path');
});

/* ---------- path geometry ---------- */

test('atS advances monotonically and stays on the polyline', () => {
  const { path, pathLen } = E.buildPath(L);
  let prev = -1;
  for (let s = 0; s <= pathLen; s += pathLen / 50) {
    const p = E.atS(path, pathLen, s);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    assert.ok(s >= prev); prev = s;
  }
  assert.equal(E.atS(path, pathLen, pathLen + 5).off, true, 'past the end is a leak');
});

test('pathCells covers the whole route and nothing off it', () => {
  const cells = E.pathCells(L);
  // every route vertex is blocked
  for (const [c, r] of L.route) assert.ok(cells.has(E.cellKey(c, r)));
  // a cell the route never touches is free
  assert.equal(cells.has(E.cellKey(7, 0)), false);
});

test('cellAt maps pixels back to cells and rejects off-grid points', () => {
  assert.deepEqual(E.cellAt(L, L.CELL * 1.5, L.CELL * 2.5), { c: 1, r: 2 });
  assert.equal(E.cellAt(L, -5, 10), null);
  assert.equal(E.cellAt(L, L.W + 5, 10), null);
});

/* ---------- building ---------- */

test('a tower can only go on an empty, on-grid, non-path cell you can afford', () => {
  const w = E.createWorld();
  const cell = firstBuildable(w);
  const [pc, pr] = L.route[0];

  assert.equal(E.canBuild(w, pc, pr, 'node'), false, 'not on the path');
  assert.equal(E.canBuild(w, -1, 0, 'node'), false, 'not off the grid');

  w.components = 0;
  assert.equal(E.canBuild(w, cell.c, cell.r, 'node'), false, 'not while broke');
  w.components = 12;
  assert.equal(E.canBuild(w, cell.c, cell.r, 'node'), true);
});

test('building deducts components, places the tower, and blocks the cell', () => {
  const w = richWorld();
  const cell = firstBuildable(w);
  const before = w.components;
  assert.equal(E.buildTower(w, cell.c, cell.r, 'node'), true);
  assert.equal(w.components, before - E.TOWER_TYPES.node.cost);
  assert.ok(E.towerAt(w, cell.c, cell.r), 'tower is there');
  assert.equal(E.canBuild(w, cell.c, cell.r, 'node'), false, 'cell now occupied');
});

/* ---------- levelling ---------- */

test('a tower starts at level 1 and levels itself on XP', () => {
  const w = richWorld();
  const cell = firstBuildable(w);
  E.buildTower(w, cell.c, cell.r, 'node');
  const t = w.towers[0];
  assert.equal(t.level, 1);
  assert.equal(t.xp, 0);

  assert.equal(E.addXp(t, E.xpForNext(1) - 1), false, 'one short of the threshold');
  assert.equal(t.level, 1);
  assert.equal(E.addXp(t, 1), true, 'and now it levels');
  assert.equal(t.level, 2);
});

test('levelling caps at MAX_LEVEL and stops banking XP there', () => {
  const t = { type: 'node', level: 1, xp: 0 };
  E.addXp(t, 1e9);
  assert.equal(t.level, E.MAX_LEVEL);
  assert.equal(t.xp, 0, 'no overflow hoarded at the cap');
  assert.equal(E.addXp(t, 1e9), false, 'and nothing more to gain');
  assert.equal(E.xpForNext(E.MAX_LEVEL), Infinity);
});

test('every stat improves with level, and rate improves by getting shorter', () => {
  const w = E.createWorld({});
  const at = (level) => E.stats(w, { type: 'breaker', level, xp: 0 });
  const lo = at(1), hi = at(E.MAX_LEVEL);
  assert.ok(hi.dmg > lo.dmg);
  assert.ok(hi.range > lo.range);
  assert.ok(hi.splash > lo.splash);
  assert.ok(hi.rate < lo.rate, 'rate is a cooldown: lower is faster');
});

/* The two numbers the feedback stated outright, so they are pinned rather than
   left to drift the next time the level curve is tuned. */
test('a level-10 breaker reaches exactly three cells', () => {
  const w = E.createWorld({});
  const r = E.stats(w, { type: 'breaker', level: E.MAX_LEVEL, xp: 0 }).range;
  assert.equal(r, 3 * E.CELL);
});

test('a level-10 breaker with the range track maxed reaches exactly four cells', () => {
  const w = E.createWorld({});
  w.classUpgrades.breaker.range = E.CLASS_MAX;
  const r = E.stats(w, { type: 'breaker', level: E.MAX_LEVEL, xp: 0 }).range;
  assert.equal(r, 4 * E.CELL);
});

test('XP is credited for damage that lands, not damage attempted', () => {
  // A Breaker hits for 24. Give it a target holding 1hp and the credit must be
  // ~1, not 24 — otherwise a tower parked over the spawn levels on overkill.
  const w = towerVsEnemy('breaker');
  const t = w.towers[0];
  w.enemies[0].hp = 1;
  w.enemies[0].maxhp = 500;
  E.step(w, 1 / 60);
  assert.equal(w.enemies.length, 0, 'the hit killed it');
  // written against the rate rather than a literal, so cutting XP again cannot
  // quietly turn this into an assertion that passes for the wrong reason
  assert.ok(t.xp <= 1 * E.XP_PER_DAMAGE + E.XP_KILL_BONUS + 1e-9,
    `overkill was banked as XP (${t.xp})`);
  assert.ok(t.xp > 0, 'but the kill did pay something');
});

test('levelling is paced in thousands of damage, not tens', () => {
  /* The v28 cut, pinned as a claim about the game rather than about a
     constant: a tower should not reach the cap on a couple of Loads. */
  const total = Array.from({ length: E.MAX_LEVEL - 1 }, (_, i) => E.xpForNext(i + 1))
    .reduce((a, b) => a + b, 0);
  const damageToMax = total / E.XP_PER_DAMAGE;
  assert.ok(damageToMax > 4000, `1-10 should cost real work, got ${Math.round(damageToMax)} damage`);
  assert.ok(damageToMax < 12000, `but must stay reachable in a run, got ${Math.round(damageToMax)}`);
});

/* ---------- the armory ---------- */

test('a class buys its speciality cheaper and its opposite dearer', () => {
  for (const type of E.TOWER_KEYS) {
    const T = E.TOWER_TYPES[type];
    const plain = E.CLASS_TRACKS.find(k => k !== T.spec && k !== T.weak);
    assert.ok(E.classCost(type, T.spec, 0) < E.classCost(type, plain, 0),
      `${type}'s speciality (${T.spec}) should undercut ${plain}`);
    assert.ok(E.classCost(type, T.weak, 0) > E.classCost(type, plain, 0),
      `${type}'s weakness (${T.weak}) should cost more than ${plain}`);
  }
});

test('class upgrades are bought with components and cap out', () => {
  const w = richWorld();
  const before = w.components;
  assert.equal(E.buyClassUpgrade(w, 'node', 'rate'), true);
  assert.equal(w.classUpgrades.node.rate, 1);
  assert.ok(w.components < before, 'it cost something');

  while (E.buyClassUpgrade(w, 'node', 'rate')) { /* to the cap */ }
  assert.equal(w.classUpgrades.node.rate, E.CLASS_MAX);
  assert.equal(E.classCost('node', 'rate', E.CLASS_MAX), null, 'maxed');
});

test('each level of a track costs meaningfully more than the last', () => {
  // The armory never resets, so a flat curve means it fills up and stays full.
  for (const type of E.TOWER_KEYS) {
    for (const track of E.CLASS_TRACKS) {
      for (let l = 1; l < E.CLASS_MAX; l++) {
        assert.ok(E.classCost(type, track, l) > E.classCost(type, track, l - 1),
          `${type}/${track} level ${l} should cost more than ${l - 1}`);
      }
      assert.ok(E.classCost(type, track, E.CLASS_MAX - 1) > E.classCost(type, track, 0) * 8,
        `${type}/${track}'s last level should be the real commitment`);
    }
  }
});

test('every track does something on every class, however it is priced', () => {
  /* Coil's splash track was inert for two builds: base splash was 0 and `stats`
     grows splash multiplicatively, so buying it changed nothing at any price.
     A discount on a track that does nothing is worse than no discount. */
  const w = E.createWorld({});
  for (const type of E.TOWER_KEYS) {
    const t = { type, level: 1, xp: 0 };
    const before = E.stats(w, t);
    for (const track of E.CLASS_TRACKS) {
      const bumped = E.createWorld({});
      bumped.classUpgrades[type][track] = E.CLASS_MAX;
      const after = E.stats(bumped, t);
      // rate is a cooldown, so "better" means smaller
      const moved = track === 'rate' ? after.rate < before.rate : after[track] > before[track];
      assert.ok(moved, `${type}'s ${track} track buys nothing`);
    }
  }
});

test('a class upgrade lifts every tower of that class and no others', () => {
  const w = richWorld();
  const node = { type: 'node', level: 1, xp: 0 };
  const coil = { type: 'coil', level: 1, xp: 0 };
  const nodeBefore = E.stats(w, node).dmg, coilBefore = E.stats(w, coil).dmg;
  w.classUpgrades.node.dmg = E.CLASS_MAX;
  assert.ok(E.stats(w, node).dmg > nodeBefore, 'the node got stronger');
  assert.equal(E.stats(w, coil).dmg, coilBefore, 'the coil did not');
});

test('the armory survives a reset, because that is the point of it', () => {
  const w = richWorld();
  E.buyClassUpgrade(w, 'breaker', 'splash');
  const kept = w.classUpgrades.breaker.splash;
  assert.ok(kept > 0);
  E.resetGame(w);
  assert.equal(w.classUpgrades.breaker.splash, kept);
  assert.equal(w.wave, 0, 'but the run itself did reset');
});

/* ---------- winning, and what a win unlocks ---------- */

/** Drive a world to just past its win wave without playing it: the point of
 *  these tests is the flag and the unlock, not the fighting. */
function clearTo(w, wave) {
  w.wave = wave;
  w.waveActive = true;
  w.spawnQueue = [];
  w.enemies = [];
  E.step(w, 1 / 60);
  return w;
}

/** A world whose run is finished and won, for tests about what that unlocks. */
function wonWorld(difficulty = 'easy') {
  const w = E.createWorld({ difficulty });
  clearTo(w, E.winWave(difficulty));
  return w;
}

test('the win is reachable with waves overlapping, which is how Auto plays', () => {
  /* The v29 regression, pinned. The win used to hang off the wave-*clear* edge,
     and Auto opens the next wave the moment the current stops spawning — so the
     board rarely empties, that edge rarely fires, and the wave counter sailed
     past the win wave with nothing happening. */
  const w = E.createWorld({ difficulty: 'easy' });
  w.wave = E.winWave('easy');
  w.waveActive = true;
  // overlapping waves: something is always queued, so a clear edge never comes
  w.spawnQueue = [{ type: 'surge', at: 0 }];
  w.enemies = [{ type: 'surge', dist: 0, hp: 5, maxhp: 5, speed: 0, r: 12, slow: 0 }];
  E.step(w, 1 / 60);
  assert.equal(w.won, false, 'not while there is still a wave on the board');

  // the moment the board is genuinely clear, it lands — no edge required
  w.spawnQueue = [];
  w.enemies = [];
  E.step(w, 1 / 60);
  assert.equal(w.won, true);
  assert.equal(w.justWon, true);
});

test('every tenth wave is a surge, and surges are the same wave arriving harder', () => {
  for (const w of [10, 20, 50]) assert.equal(E.isSurgeWave(w), true, `wave ${w} is a surge`);
  for (const w of [1, 9, 11, 19]) assert.equal(E.isSurgeWave(w), false, `wave ${w} is not`);

  /* A surge must not be a *different* wave: every enemy type wave 10 would
     normally send still has to be in it, or a player's read of what is coming
     stops applying exactly when it matters most. */
  const plain = E.wavePlan(9), surge = E.wavePlan(10);
  const kinds = (p) => [...new Set(p.map(g => g.type))].sort();
  for (const k of kinds(plain)) assert.ok(kinds(surge).includes(k), `a surge still sends ${k}`);

  const count = (p) => p.reduce((n, g) => n + g.count, 0);
  assert.ok(count(surge) > count(E.wavePlan(11)),
    'a surge sends more than the wave after it, not merely more than the one before');
  assert.ok(E.hpScale(10) > E.hpScale(11), 'and hits harder than the wave after it too');
});

test('the win fires when the win wave is beaten, not when the board happens to be clear', () => {
  /* The reported bug: waves overlap and the shell auto-starts, so a board clear
     of *everything* may never happen, and the win waited for it. */
  const w = E.createWorld({ difficulty: 'easy' });
  const target = E.winWave('easy');
  w.wave = target;
  w.waveActive = true;
  w.spawnQueue = [];
  w.enemies = [];
  E.step(w, 1 / 60);
  assert.equal(w.won, true, 'wave 50 beaten with nothing of it left');

  // and again with a later wave already on the board
  const v = E.createWorld({ difficulty: 'easy' });
  v.wave = target + 1;
  v.waveActive = true;
  v.spawnQueue = [{ type: 'surge', at: 99, wave: target + 1 }];
  v.enemies = [{ type: 'surge', dist: 0, hp: 20, maxhp: 20, speed: 0, r: 12, slow: 0, wave: target + 1 }];
  E.step(v, 1 / 60);
  assert.equal(v.won, true, 'wave 51 on the board must not hold back the wave-50 win');
});

test('a straggler from the win wave still holds the win back', () => {
  const w = E.createWorld({ difficulty: 'easy' });
  const target = E.winWave('easy');
  w.wave = target + 3;
  w.waveActive = true;
  w.spawnQueue = [];
  w.enemies = [{ type: 'load', dist: 0, hp: 500, maxhp: 500, speed: 0, r: 19, slow: 0, wave: target }];
  E.step(w, 1 / 60);
  assert.equal(w.won, false, 'one of the win wave is still alive');
});

test('difficulty unlocks are per circuit', () => {
  /* It used to be one win anywhere: beating Easy on circuit 1 opened Medium on
     a circuit you had never played. */
  const p = E.newProgress();
  assert.equal(E.difficultyUnlocked(p, 'easy', 0), true, 'easy is always open');
  assert.equal(E.difficultyUnlocked(p, 'medium', 0), false);

  E.recordWin(p, 'easy', 0);
  assert.equal(E.difficultyUnlocked(p, 'medium', 0), true, 'won easy here, so medium here');
  assert.equal(E.difficultyUnlocked(p, 'medium', 1), false, 'but not on a circuit never beaten');

  // the circuit-less question still has an answer, for a menu listing difficulties
  assert.equal(E.difficultyUnlocked(p, 'medium'), true, 'medium is open somewhere');
});

test('the armory is a running choice, not a checklist that completes', () => {
  /* It cost under two Easy runs of kill income, so two runs bought everything
     and every later circuit started solved. Pinned as a ratio rather than a
     total, so retuning the curve has to stay honest about what it costs. */
  let full = 0;
  for (const t of E.TOWER_KEYS) for (const tr of E.CLASS_TRACKS) {
    for (let l = 0; l < E.CLASS_MAX; l++) full += E.classCost(t, tr, l);
  }
  let income = 0;
  for (let wv = 1; wv <= E.winWave('easy'); wv++) {
    for (const g of E.wavePlan(wv)) income += g.count * (E.ENEMY_TYPES[g.type]?.bounty || 1);
  }
  const runs = full / income;
  assert.ok(runs > 3.5, `a full armory costs ${runs.toFixed(1)} Easy runs, still too few`);

  // and the top of a track has to be a real decision, not a rounding error
  const first = E.classCost('node', 'dmg', 0), last = E.classCost('node', 'dmg', E.CLASS_MAX - 1);
  assert.ok(last > first * 20, `the last level costs ${(last / first).toFixed(0)}x the first`);
});

test('no tower shares a colour with another tower or with an enemy', () => {
  // Coil was the exact value the Patch enemy uses, so the healer you most want
  // to pick out of a crowd looked like one of your own towers
  const towerCols = E.TOWER_KEYS.map(k => E.TOWER_TYPES[k].col);
  assert.equal(new Set(towerCols).size, towerCols.length, 'towers differ from each other');
  const enemyCols = new Set(Object.values(E.ENEMY_TYPES).map(e => e.col));
  for (const c of towerCols) assert.ok(!enemyCols.has(c), `a tower and an enemy share ${c}`);
});

test('the win cannot be had by starting waves you never clear', () => {
  const w = E.createWorld({ difficulty: 'easy' });
  w.wave = E.winWave('easy') + 20;          // spammed Start Wave
  w.waveActive = true;
  w.spawnQueue = [];
  w.enemies = [{ type: 'load', dist: 0, hp: 500, maxhp: 500, speed: 0, r: 19, slow: 0 }];
  E.step(w, 1 / 60);
  assert.equal(w.won, false, 'the board still has to be cleared');
});

test('waves cleared is counted separately from waves started', () => {
  const w = E.createWorld({ difficulty: 'easy' });
  assert.equal(w.wavesCleared, 0);
  E.startWave(w);
  E.startWave(w);                            // overlapped: two started, none done
  assert.equal(w.wave, 2);
  assert.equal(w.wavesCleared, 0);
  w.spawnQueue = []; w.enemies = [];
  E.step(w, 1 / 60);
  assert.equal(w.wavesCleared, 1, 'one clear, however many waves were queued into it');
});

test('clearing the win wave takes the circuit', () => {
  const w = E.createWorld({ difficulty: 'easy' });
  assert.equal(w.won, false, 'a run does not start won');

  clearTo(w, E.winWave('easy') - 1);
  assert.equal(w.won, false, 'one short is not a win');

  clearTo(w, E.winWave('easy'));
  assert.equal(w.won, true);
  assert.equal(w.justWon, true, 'and the shell gets an edge to catch');
});

test('each difficulty asks for a longer run than the one below', () => {
  const waves = E.DIFFICULTY_KEYS.map(k => E.winWave(k));
  for (let i = 1; i < waves.length; i++) {
    assert.ok(waves[i] > waves[i - 1], `${E.DIFFICULTY_KEYS[i]} should run longer`);
  }
});

test('winning is congratulated once, not on every wave after it', () => {
  const w = E.createWorld({ difficulty: 'easy' });
  clearTo(w, E.winWave('easy'));
  w.justWon = false;                       // the shell consumes the edge
  clearTo(w, E.winWave('easy') + 1);
  assert.equal(w.won, true, 'still won');
  assert.equal(w.justWon, false, 'but not announced again');
});

test('a won run can keep going, and losing afterwards is still a loss', () => {
  const w = E.createWorld({ difficulty: 'easy' });
  clearTo(w, E.winWave('easy'));
  w.integrity = 1;
  w.enemies = [{ type: 'surge', dist: w.pathLen + 1, hp: 5, maxhp: 5, speed: 0, r: 12, slow: 0 }];
  E.step(w, 1 / 60);
  assert.equal(w.over, true, 'the core can still break after a win');
  assert.equal(w.won, true, 'and the win is not taken back');
});

test('a fresh run clears the win flags', () => {
  const w = E.createWorld({ difficulty: 'easy' });
  clearTo(w, E.winWave('easy'));
  E.resetGame(w);
  assert.equal(w.won, false);
  assert.equal(w.justWon, false);
});

/* ---------- progression ---------- */

test('only the first circuit is open to start with', () => {
  const p = E.newProgress();
  assert.equal(E.routeUnlocked(p, 'easy', 0), true);
  for (let i = 1; i < E.ROUTE_COUNT; i++) {
    assert.equal(E.routeUnlocked(p, 'easy', i), false, `circuit ${i + 1} is earned`);
  }
  assert.equal(E.unlockedRoutes(p, 'easy'), 1);
});

test('winning a circuit opens the next one, on that difficulty only', () => {
  const p = E.newProgress();
  E.recordWin(p, 'easy', 0);
  assert.equal(E.routeUnlocked(p, 'easy', 1), true);
  assert.equal(E.unlockedRoutes(p, 'easy'), 2);
  assert.equal(E.routeUnlocked(p, 'medium', 1), false, 'medium starts its own campaign');
});

test('circuits open one at a time, in order', () => {
  const p = E.newProgress();
  // winning the *last* circuit out of order must not open the middle one
  E.recordWin(p, 'easy', E.ROUTE_COUNT - 1);
  assert.equal(E.unlockedRoutes(p, 'easy'), 1, 'still only the first is reachable');
  E.recordWin(p, 'easy', 0);
  assert.equal(E.unlockedRoutes(p, 'easy'), 2);
});

test('only easy is open until something is won', () => {
  const p = E.newProgress();
  assert.equal(E.difficultyUnlocked(p, 'easy'), true);
  assert.equal(E.difficultyUnlocked(p, 'medium'), false);
  assert.equal(E.difficultyUnlocked(p, 'hard'), false);

  E.recordWin(p, 'easy', 0);
  assert.equal(E.difficultyUnlocked(p, 'medium'), true, 'one easy win opens medium');
  assert.equal(E.difficultyUnlocked(p, 'hard'), false, 'but not hard');

  E.recordWin(p, 'medium', 0);
  assert.equal(E.difficultyUnlocked(p, 'hard'), true);
});

test('the default difficulty is one a new player actually has', () => {
  assert.equal(E.difficultyUnlocked(E.newProgress(), E.DEFAULT_DIFFICULTY), true);
});

test('recordWin reports what it opened, and only the first time', () => {
  const p = E.newProgress();
  const first = E.recordWin(p, 'easy', 0);
  assert.equal(first.route, 1, 'circuit 2 opened');
  assert.equal(first.difficulty, 'medium', 'and medium with it');

  const again = E.recordWin(p, 'easy', 0);
  assert.equal(again.route, null, 'winning the same circuit twice opens nothing new');
  assert.equal(again.difficulty, null);
});

test('the last circuit has nothing after it to open', () => {
  const p = E.newProgress();
  for (let i = 0; i < E.ROUTE_COUNT - 1; i++) E.recordWin(p, 'easy', i);
  assert.equal(E.unlockedRoutes(p, 'easy'), E.ROUTE_COUNT);
  const last = E.recordWin(p, 'easy', E.ROUTE_COUNT - 1);
  assert.equal(last.route, null, 'no circuit beyond the last');
  assert.equal(E.routeUnlocked(p, 'easy', E.ROUTE_COUNT), false, 'and none off the end');
});

test('stored progress is clamped rather than trusted', () => {
  const junk = E.sanitizeProgress({
    wins: { easy: [0, 0, 99, -1, 'nonsense', 1.7], medium: 'not an array', bogus: [0] },
  });
  assert.deepEqual(junk.wins.easy, [0, 1], 'deduped, floored, and dropped if off the end');
  assert.deepEqual(junk.wins.medium, []);
  assert.equal(junk.wins.bogus, undefined, 'unknown difficulties dropped');
  assert.deepEqual(E.sanitizeProgress(null), E.newProgress(), 'and nothing at all is fine');
});

test('progress is not run state, so a snapshot leaves it alone', () => {
  const w = E.createWorld({ difficulty: 'easy' });
  const snap = JSON.parse(JSON.stringify(E.snapshot(w)));
  assert.equal(snap.wins, undefined);
  assert.equal(snap.progress, undefined);
});

test('a resumed run remembers it was won, but is not congratulated again', () => {
  const w = E.createWorld({ difficulty: 'easy' });
  clearTo(w, E.winWave('easy'));
  assert.equal(w.justWon, true);

  const snap = JSON.parse(JSON.stringify(E.snapshot(w)));
  const fresh = E.createWorld({ difficulty: 'easy' });
  assert.equal(E.hydrate(fresh, snap), true);
  assert.equal(fresh.won, true, 'the circuit stays taken');
  assert.equal(fresh.justWon, false, 'but the banner does not fire on the first frame back');

  clearTo(fresh, E.winWave('easy') + 1);
  assert.equal(fresh.justWon, false, 'nor on the next wave');
});

/* ---------- difficulty ---------- */

test('the ladder steps up at every rung, on every dial', () => {
  /* Easy was reported as too easy, so the whole ladder shifted up one: the old
     Medium is the new Easy, the old Hard the new Medium, and Hard is new. */
  const keys = E.DIFFICULTY_KEYS;
  for (let i = 1; i < keys.length; i++) {
    const lo = E.DIFFICULTIES[keys[i - 1]], hi = E.DIFFICULTIES[keys[i]];
    assert.ok(hi.hp > lo.hp, `${keys[i]} enemies should be tougher`);
    assert.ok(hi.components < lo.components, `${keys[i]} should start poorer`);
    assert.ok(hi.integrity < lo.integrity, `${keys[i]} should forgive fewer leaks`);
    assert.ok(hi.winWave > lo.winWave, `${keys[i]} should run longer`);
  }
  assert.ok(E.DIFFICULTIES.easy.hp >= 1.0, 'the new easy is the old medium, not softer still');
});

test('hard cuts the income as well as raising the health', () => {
  /* More health alone stops being difficulty past a point and becomes waiting:
     the towers still win every exchange, each one just takes longer. */
  const easy = E.createWorld({ difficulty: 'easy' });
  const hard = E.createWorld({ difficulty: 'hard' });
  assert.ok(E.bountyOf(hard, 'surge') < E.bountyOf(easy, 'surge'), 'kills pay less on hard');
  assert.equal(E.bountyOf(easy, 'surge'), E.ENEMY_TYPES.surge.bounty, 'and easy is untouched');
});

test('score is not scaled by difficulty, only income is', () => {
  const hard = E.createWorld({ difficulty: 'hard' });
  hard.enemies = [{ type: 'surge', dist: 0, hp: 0, maxhp: 20, speed: 0, r: 12, slow: 0 }];
  const before = { comps: hard.components, score: hard.score };
  E.step(hard, 1 / 60);
  assert.equal(hard.score - before.score, E.ENEMY_TYPES.surge.bounty, 'score is comparable across runs');
  assert.ok(hard.components - before.comps < E.ENEMY_TYPES.surge.bounty, 'but the purse is not');
});

test('a fractional bounty is not rounded away to nothing', () => {
  // a 0.75 cut on a 1-component Surge floors to 0 if rounded per kill, which
  // would make Hard's Swarm literally worthless
  const hard = E.createWorld({ difficulty: 'hard' });
  assert.ok(E.bountyOf(hard, 'swarm') > 0);
});

test('a Breaker levels slower per point of damage than a Node', () => {
  /* Reported: Breakers level far too quickly. XP is credited per damage dealt
     and a Breaker deals several times what a Node does per shot, so on a flat
     rate the class that hits hardest also levels fastest — compounding an
     advantage it already had. */
  assert.ok(E.XP_RATE.breaker < E.XP_RATE.node, 'breaker earns at a discount');
  for (const k of E.TOWER_KEYS) assert.ok(E.XP_RATE[k] > 0, `${k} still levels`);

  // and it shows up in a real exchange, not just the table
  const xpFor = (type) => {
    const w = towerVsEnemy(type);
    w.enemies[0].hp = 1e6; w.enemies[0].maxhp = 1e6;
    for (let i = 0; i < 240; i++) E.step(w, 1 / 60);
    const s = E.stats(w, w.towers[0]);
    // XP per unit of damage output, so the comparison is fair across fire rates
    return w.towers[0].xp / (s.dmg / s.rate);
  };
  assert.ok(xpFor('breaker') < xpFor('node'), 'per unit of damage output, a breaker gains less');
});

test('a harder difficulty levels towers more slowly', () => {
  for (const k of E.DIFFICULTY_KEYS) assert.ok(E.DIFFICULTIES[k].xp > 0, `${k} has an xp dial`);
  assert.ok(E.DIFFICULTIES.hard.xp < E.DIFFICULTIES.medium.xp);
  assert.ok(E.DIFFICULTIES.medium.xp < E.DIFFICULTIES.easy.xp);

  const gained = (difficulty) => {
    const w = towerVsEnemy('node', { difficulty });
    w.enemies[0].hp = 1e6; w.enemies[0].maxhp = 1e6;
    for (let i = 0; i < 240; i++) E.step(w, 1 / 60);
    return w.towers[0].level * 1000 + w.towers[0].xp;
  };
  assert.ok(gained('hard') < gained('easy'), 'the same fight teaches less on hard');
});

test('the armory is a long-term commitment, not an early purchase', () => {
  // it is permanent, so filling it quickly means the game solves itself for
  // good rather than for a run
  const track = (type, k) => [0, 1, 2, 3, 4].reduce((a, l) => a + E.classCost(type, k, l), 0);
  assert.ok(track('node', 'rate') > 1500, 'a full track is a real bill');
  assert.ok(E.CLASS_COST_STEP > 2, 'and the last levels are the expensive ones');
});

test('difficulty scales enemy hp and the opening purse in opposite directions', () => {
  const easy = E.createWorld({ difficulty: 'easy' });
  const hard = E.createWorld({ difficulty: 'hard' });
  assert.ok(E.hpScale(5, 'hard') > E.hpScale(5, 'easy'), 'hard enemies are tougher');
  assert.ok(hard.components < easy.components, 'and you start with less to spend');
  assert.ok(hard.integrity < easy.integrity, 'and less to lose');
});

test('an unknown difficulty falls back rather than producing NaN', () => {
  const w = E.createWorld({ difficulty: 'impossible' });
  assert.equal(w.difficulty, E.DEFAULT_DIFFICULTY);
  assert.ok(Number.isFinite(E.hpScale(3, 'impossible')));
});

test('selling refunds part of what was sunk in and frees the cell', () => {
  const w = richWorld();
  const cell = firstBuildable(w);
  E.buildTower(w, cell.c, cell.r, 'breaker');
  const refund = E.sellValue(w.towers[0]);
  const before = w.components;
  assert.equal(E.sellTower(w, 0), true);
  assert.equal(w.components, before + refund);
  assert.equal(E.towerAt(w, cell.c, cell.r), null);
  assert.ok(refund > 0 && refund < E.TOWER_TYPES.breaker.cost, 'partial refund');
});

/* ---------- moving a tower ---------- */

/** A rich world with one tower built on the first buildable cell. */
function withTower(type = 'node') {
  const w = richWorld();
  const cell = firstBuildable(w);
  E.buildTower(w, cell.c, cell.r, type);
  return w;
}

/** The first empty, non-path cell that is not where tower `i` already stands. */
function otherFreeCell(w, i) {
  const t = w.towers[i];
  for (let r = 0; r < w.L.ROWS; r++) {
    for (let c = 0; c < w.L.COLS; c++) {
      if (w.blocked.has(E.cellKey(c, r))) continue;
      if (E.towerAt(w, c, r)) continue;
      if (t.c === c && t.r === r) continue;
      return { c, r };
    }
  }
  throw new Error('no free cell to move to');
}

test('a moved tower keeps everything it earned', () => {
  const w = withTower('breaker');
  const t = w.towers[0];
  E.addXp(t, E.xpForNext(1) + E.xpForNext(2));
  E.setPriority(w, 0, 'strongest');
  const level = t.level, xp = t.xp;
  assert.ok(level > 1, 'it levelled up first');

  const to = otherFreeCell(w, 0);
  assert.equal(E.moveTower(w, 0, to.c, to.r), true);
  assert.equal(t.c, to.c);
  assert.equal(t.r, to.r);
  assert.equal(t.level, level, 'levels are earned by fighting, not by standing still');
  assert.equal(t.xp, xp);
  assert.equal(t.priority, 'strongest');
  assert.equal(t.type, 'breaker');
});

test('moving charges the fee a sell-and-rebuild would have burned', () => {
  const w = withTower('breaker');
  const before = w.components;
  const to = otherFreeCell(w, 0);
  E.moveTower(w, 0, to.c, to.r);
  assert.equal(w.components, before - E.sellValue(w.towers[0]));
});

test('a move is refused where a build would be, and changes nothing', () => {
  const w = withTower();
  const t = w.towers[0];
  const at = { c: t.c, r: t.r };
  const purse = w.components;

  const onPath = [...w.blocked][0].split(',').map(Number);
  assert.equal(E.moveTower(w, 0, onPath[0], onPath[1]), false, 'not onto the route');
  assert.equal(E.moveTower(w, 0, -1, 0), false, 'not off the grid');
  assert.equal(E.moveTower(w, 0, t.c, t.r), false, 'staying put is not a move');

  // and not onto another tower
  const other = otherFreeCell(w, 0);
  E.buildTower(w, other.c, other.r, 'node');
  const purse2 = w.components;
  assert.equal(E.moveTower(w, 0, other.c, other.r), false, 'not onto an occupied cell');

  assert.equal(w.towers[0].c, at.c);
  assert.equal(w.towers[0].r, at.r);
  assert.equal(w.components, purse2, 'a refused move is free');
  assert.ok(purse >= purse2);
});

test('a move you cannot afford is refused', () => {
  const w = withTower('breaker');
  const to = otherFreeCell(w, 0);
  w.components = E.moveCost(w.towers[0]) - 1;
  assert.equal(E.canMove(w, 0, to.c, to.r), false);
  assert.equal(E.moveTower(w, 0, to.c, to.r), false);
  // and it goes through the moment the money is there
  w.components = E.moveCost(w.towers[0]);
  assert.equal(E.moveTower(w, 0, to.c, to.r), true);
  assert.equal(w.components, 0);
});

test('a moved tower reloads rather than arriving ready to fire', () => {
  const w = towerVsEnemy('breaker');
  E.step(w, 1 / 60);                       // fires, then starts cooling
  w.towers[0].cool = 0;                    // ready again
  const to = otherFreeCell(w, 0);
  E.moveTower(w, 0, to.c, to.r);
  assert.equal(w.towers[0].cool, E.stats(w, w.towers[0]).rate,
    'a move must not double as a free reload');
  assert.equal(w.towers[0].aim, null, 'and it re-acquires from the new cell');
});

/** A buildable cell that overlooks *no* part of the route within `type`'s
 *  range — the opposite of `overlook`, for testing a bad placement. */
function blindCell(w, type) {
  const range = stats0(type).range;
  for (let r = 0; r < w.L.ROWS; r++) {
    for (let c = 0; c < w.L.COLS; c++) {
      if (w.blocked.has(E.cellKey(c, r)) || E.towerAt(w, c, r)) continue;
      const tc = E.cellCenter(w.L, c, r);
      let sees = false;
      for (let d = 0; d <= w.pathLen && !sees; d += 4) {
        const p = E.atS(w.path, w.pathLen, d);
        if (Math.hypot(p.x - tc.x, p.y - tc.y) <= range) sees = true;
      }
      if (!sees) return { c, r };
    }
  }
  throw new Error(`every buildable cell overlooks the route for ${type}`);
}

test('a moved tower fights from where it landed', () => {
  const w = richWorld();
  // build somewhere useless, then move it onto a cell that overlooks the route
  const idle = blindCell(w, 'breaker');
  E.buildTower(w, idle.c, idle.r, 'breaker');
  const { c, r, d } = overlook(w, 'breaker');
  w.enemies.push({ type: 'load', dist: d, hp: 500, maxhp: 500, speed: 0, r: 15, slow: 0 });

  E.step(w, 1 / 60);
  const untouched = w.enemies[0].hp;

  assert.equal(E.moveTower(w, 0, c, r), true);
  // it arrives reloading, so give it its cooldown before expecting a shot
  const reload = E.stats(w, w.towers[0]).rate;
  E.step(w, reload + 1 / 60);
  assert.ok(w.enemies[0].hp < untouched, 'it shoots from its new cell');
});

test('rotating the board carries a moved tower with it', () => {
  const w = withTower();
  const to = otherFreeCell(w, 0);
  E.moveTower(w, 0, to.c, to.r);
  E.relayout(w, E.LAYOUT_TALL);
  assert.equal(w.towers[0].c, to.r, 'transposed like any other tower');
  assert.equal(w.towers[0].r, to.c);
  assert.ok(!w.blocked.has(E.cellKey(w.towers[0].c, w.towers[0].r)),
    'and it did not land on the route');
});

/* ---------- towers firing ---------- */

/** Put one enemy at a known distance and one tower next to that point. */
/* Find a buildable cell that actually overlooks the route, and a stretch of
   path it covers — every distance from `d` to `d + span` inside the tower's
   range, so a test that wants two enemies near each other gets two enemies the
   tower can genuinely see.

   Both of these used to take the first empty cell and the first covered point
   and hope. That held only because route 0 started in the top-left corner and
   ran along the second row; reordering the routes by difficulty broke a dozen
   tests at once for a reason that had nothing to do with what any of them was
   testing. Searching for what the test needs is barely more code and does not
   care what shape the routes are. */
function overlook(w, type, span = 0) {
  const s = stats0(type);
  for (let r = 0; r < w.L.ROWS; r++) {
    for (let c = 0; c < w.L.COLS; c++) {
      if (w.blocked.has(E.cellKey(c, r))) continue;
      const tc = E.cellCenter(w.L, c, r);
      const covers = (d) => {
        const p = E.atS(w.path, w.pathLen, d);
        return Math.hypot(p.x - tc.x, p.y - tc.y) <= s.range;
      };
      for (let d = 0; d + span < w.pathLen; d += 3) {
        if (!covers(d) || !covers(d + span) || !covers(d + span / 2)) continue;
        return { c, r, d };
      }
    }
  }
  throw new Error(`no cell overlooks ${span}px of route within ${type}'s range`);
}

function towerVsEnemy(type, opts = {}) {
  const w = richWorld(opts);
  const { c, r, d } = overlook(w, type);
  E.buildTower(w, c, r, type);
  w.enemies.push({ type: 'load', dist: d, hp: 500, maxhp: 500, speed: 0, r: 15, slow: 0 });
  return w;
}
/** A fresh level-1 tower's numbers — what a newly built one actually fires at. */
const stats0 = (type) => E.stats(E.createWorld({}), { type, level: 1, xp: 0 });

test('a tower damages an enemy in range on its cooldown', () => {
  const w = towerVsEnemy('node');
  const hp0 = w.enemies[0].hp;
  E.step(w, 1 / 60);                 // first frame: cool is 0, so it fires
  assert.ok(w.enemies[0].hp < hp0, 'took damage');
  const afterShot = w.enemies[0].hp;
  E.step(w, 1 / 60);                 // still cooling — no second shot
  assert.equal(w.enemies[0].hp, afterShot, 'held fire during cooldown');
});

test('a tower ignores enemies out of range', () => {
  const w = richWorld();
  const cell = firstBuildable(w);
  E.buildTower(w, cell.c, cell.r, 'node');
  // enemy parked at the far end of the path, well away from a corner tower
  w.enemies.push({ type: 'surge', dist: w.pathLen - 1, hp: 20, maxhp: 20, speed: 0, r: 12, slow: 0 });
  const tc = E.cellCenter(w.L, cell.c, cell.r);
  const p = E.atS(w.path, w.pathLen, w.pathLen - 1);
  if (Math.hypot(p.x - tc.x, p.y - tc.y) > stats0('node').range) {
    E.step(w, 1 / 60);
    assert.equal(w.enemies[0].hp, 20, 'untouched');
  }
});

test('a coil slows what it hits', () => {
  const w = towerVsEnemy('coil');
  E.step(w, 1 / 60);
  assert.ok(w.enemies[0].slow > 0, 'slow timer running');
  assert.ok(w.enemies[0].slowStrength > 0, 'and a strength stamped');
});

test('a breaker splashes nearby enemies', () => {
  const w = richWorld();
  const cell = firstBuildable(w);
  const { c, r, d: d0 } = overlook(w, 'breaker', 24);
  E.buildTower(w, c, r, 'breaker');
  // two enemies a few px apart along the path, both near the target
  w.enemies.push({ type: 'load', dist: d0 + 20, hp: 500, maxhp: 500, speed: 0, r: 15, slow: 0 });
  w.enemies.push({ type: 'load', dist: d0 + 24, hp: 500, maxhp: 500, speed: 0, r: 15, slow: 0 });
  const hpA = w.enemies[0].hp, hpB = w.enemies[1].hp;
  E.step(w, 1 / 60);
  assert.ok(w.enemies[0].hp < hpA && w.enemies[1].hp < hpB, 'both took damage from one shot');
});

test('a tower re-aims mid-cooldown, so the barrel never points at nothing', () => {
  const w = towerVsEnemy('node');
  E.step(w, 1 / 60);                 // fires, aims at the only enemy
  const first = w.enemies[0];
  assert.equal(w.towers[0].aim, first, 'aimed at what it shot');

  // a second enemy at the same spot as the first — guaranteed in range, since
  // the tower just shot something there — then the first dies mid-cooldown
  w.enemies.push({ ...first, dist: first.dist, hp: 500 });
  first.hp = 0;
  E.step(w, 1 / 60);                 // still cooling — but must retarget anyway
  assert.ok(w.towers[0].cool > 0, 'still on cooldown');
  assert.equal(w.enemies.length, 1, 'the dead one was cleared');
  assert.equal(w.towers[0].aim, w.enemies[0], 'aim followed to the live enemy');
});

test('aim clears when the last target leaves range, even mid-cooldown', () => {
  const w = towerVsEnemy('node');
  E.step(w, 1 / 60);
  assert.ok(w.towers[0].aim, 'has a target');
  w.enemies.length = 0;
  E.step(w, 1 / 60);
  assert.equal(w.towers[0].aim, null, 'nothing to aim at');
});

test('a tower wakes and sleeps at different distances, so its art cannot strobe', () => {
  const w = towerVsEnemy('node');
  const t = w.towers[0];
  const c = E.cellCenter(w.L, t.c, t.r);
  const range = E.stats(w, t).range;

  // park an enemy just outside the waking threshold but inside the sleeping
  // one — the band that used to flip the answer every frame
  const e = w.enemies[0];
  const between = (E.READY_MARGIN + E.READY_SLEEP_MARGIN) / 2;
  let placed = false;
  for (let d = 0; d < w.pathLen; d += 1) {
    const p = E.atS(w.path, w.pathLen, d);
    const gap = Math.hypot(p.x - c.x, p.y - c.y) - range;
    if (gap > E.READY_MARGIN && gap < E.READY_SLEEP_MARGIN) {
      e.dist = d; placed = true;
      // sanity: `between` really does sit inside the band we just found
      assert.ok(gap > between - E.READY_MARGIN && gap < between + E.READY_SLEEP_MARGIN);
      break;
    }
  }
  assert.ok(placed, 'the route passes through the hysteresis band');

  assert.equal(E.towerReady(w, t), false, 'not near enough to wake a sleeping tower');
  assert.equal(E.towerReady(w, t, E.READY_SLEEP_MARGIN), true,
    'but near enough that a deployed one stays deployed');
});

test('the sleeping margin is the looser of the two', () => {
  assert.ok(E.READY_SLEEP_MARGIN > E.READY_MARGIN);
});

/* ---------- enemy abilities: making a favorite tower the wrong answer ---------- */

/** Park an enemy of `type` inside a fresh tower's range and return both. */
function towerVsType(towerType, enemyType, hp = 500) {
  const w = richWorld();
  const { c, r, d } = overlook(w, towerType);
  E.buildTower(w, c, r, towerType);
  const T = E.ENEMY_TYPES[enemyType];
  const e = { type: enemyType, dist: d, hp, maxhp: hp, speed: 0, r: T.r, slow: 0 };
  w.enemies.push(e);
  return { w, e };
}

test('armor blunts small hits far more than heavy ones', () => {
  // the point of Shell: Node's many weak shots are the wrong tool for it
  const node = towerVsType('node', 'shell');
  const nodeHp = node.e.hp; E.step(node.w, 1 / 60);
  const nodeDealt = nodeHp - node.e.hp;

  const breaker = towerVsType('breaker', 'shell');
  const bHp = breaker.e.hp; E.step(breaker.w, 1 / 60);
  const breakerDealt = bHp - breaker.e.hp;

  const armor = E.ENEMY_TYPES.shell.armor;
  assert.equal(nodeDealt, stats0('node').dmg - armor, 'flat reduction off a Node shot');
  assert.equal(breakerDealt, stats0('breaker').dmg - armor, 'and off a Breaker shot');
  // the same flat number costs the weak shot most of its damage and the heavy
  // one almost none — which is the whole reason a mix of towers is needed
  const nodeLoss = 1 - nodeDealt / stats0('node').dmg;
  const breakerLoss = 1 - breakerDealt / stats0('breaker').dmg;
  assert.ok(nodeLoss > breakerLoss * 3, `Node lost ${(nodeLoss * 100).toFixed(0)}%, Breaker ${(breakerLoss * 100).toFixed(0)}%`);
  // but Node is not written off — levelling it is a real answer
  const maxed = E.stats(E.createWorld({}), { type: 'node', level: E.MAX_LEVEL, xp: 0 });
  assert.ok(maxed.dmg - armor > (stats0('node').dmg - armor) * 2, 'a maxed Node gets meaningfully through');
});

test('armor never absorbs a hit completely', () => {
  const { w, e } = towerVsType('coil', 'shell');   // coil dmg is below shell armor
  const hp0 = e.hp;
  E.step(w, 1 / 60);
  assert.ok(e.hp < hp0, 'something still got through');
  assert.equal(hp0 - e.hp, E.MIN_DAMAGE, 'floored, not zeroed');
});

test('splash resistance makes area damage the wrong tool', () => {
  // two enemies together: the direct target takes full damage either way, but
  // the collateral hit is what Phase shrugs off
  const build = (type) => {
    const w = richWorld();
    const { c, r, d } = overlook(w, 'breaker', 16);
    E.buildTower(w, c, r, 'breaker');
    // leader is the direct target; the follower only ever takes splash
    w.enemies.push({ type: 'surge', dist: d + 16, hp: 900, maxhp: 900, speed: 0, r: 12, slow: 0 });
    const follower = { type, dist: d + 4, hp: 900, maxhp: 900, speed: 0, r: 11, slow: 0 };
    w.enemies.push(follower);
    return { w, follower };
  };
  const plain = build('surge'); E.step(plain.w, 1 / 60);
  const tough = build('phase'); E.step(tough.w, 1 / 60);
  const plainTook = 900 - plain.follower.hp;
  const toughTook = 900 - tough.follower.hp;
  assert.ok(plainTook > 0, 'the plain follower was splashed');
  assert.ok(toughTook < plainTook, `phase took ${toughTook} vs ${plainTook}`);
});

test('a slow-immune enemy cannot be slowed, so Coil is wasted on it', () => {
  const normal = towerVsType('coil', 'surge');
  E.step(normal.w, 1 / 60);
  assert.ok(normal.e.slow > 0, 'an ordinary surge is slowed');

  const immune = towerVsType('coil', 'phase');
  E.step(immune.w, 1 / 60);
  assert.equal(immune.e.slow, 0, 'phase shrugs it off');
  assert.ok(immune.e.hp < 500, 'though the shot still hurt a little');
});

/* ---------- the tank: a moving swarm dispenser ---------- */

function tankWorld() {
  const w = richWorld();
  const T = E.ENEMY_TYPES.tank;
  w.enemies.push({ type: 'tank', dist: 400, hp: T.hp, maxhp: T.hp, speed: T.speed,
                   r: T.r, slow: 0, deployIn: T.deployEvery, stopFor: 0 });
  return w;
}
const swarmCount = (w) => w.enemies.filter(e => e.type === 'swarm').length;

test('a tank stops and deploys swarm on its timer', () => {
  const w = tankWorld();
  const T = E.ENEMY_TYPES.tank;
  assert.equal(swarmCount(w), 0);

  // run just past the deploy interval
  for (let i = 0; i < Math.ceil(T.deployEvery * 60) + 2; i++) E.step(w, 1 / 60);
  assert.equal(swarmCount(w), T.deployCount, 'a full batch came out');

  const tank = w.enemies.find(e => e.type === 'tank');
  assert.ok(tank.stopFor > 0, 'and it halted to do it');
});

test('a halted tank makes no forward progress', () => {
  const w = tankWorld();
  const T = E.ENEMY_TYPES.tank;
  for (let i = 0; i < Math.ceil(T.deployEvery * 60) + 2; i++) E.step(w, 1 / 60);

  const tank = w.enemies.find(e => e.type === 'tank');
  const held = tank.dist;
  E.step(w, 1 / 60);
  assert.equal(tank.dist, held, 'stationary while unloading');
});

test('a destroyed tank spills half a batch where it died', () => {
  const w = tankWorld();
  const T = E.ENEMY_TYPES.tank;
  const tank = w.enemies.find(e => e.type === 'tank');
  // pinned still, so this measures where the spill lands and not the frame of
  // travel the tank would otherwise make before the kill is resolved
  tank.speed = 0;
  const where = tank.dist;

  tank.hp = -1;
  E.step(w, 1 / 60);

  assert.equal(w.enemies.some(e => e.type === 'tank'), false, 'the tank is gone');
  assert.equal(swarmCount(w), Math.floor(T.deployCount / 2), 'half a batch, not a whole one');
  // spilled at the tank's position, not back at the start
  for (const s of w.enemies.filter(e => e.type === 'swarm')) {
    assert.ok(s.dist > where - 100 && s.dist <= where, `spilled near ${where}, got ${s.dist}`);
  }
});

test('deployed swarm carry the wave hp scale, like any other spawn', () => {
  const w = tankWorld();
  w.wave = 12;
  const tank = w.enemies.find(e => e.type === 'tank');
  tank.hp = -1;
  E.step(w, 1 / 60);
  const s = w.enemies.find(e => e.type === 'swarm');
  assert.equal(s.maxhp, Math.round(E.ENEMY_TYPES.swarm.hp * E.hpScale(12)));
});

test('a patch repairs its neighbors but not itself', () => {
  const w = richWorld();
  const heals = E.ENEMY_TYPES.patch.heals;
  const patch = { type: 'patch', dist: 100, hp: 20, maxhp: 44, speed: 0, r: 13, slow: 0 };
  const hurt  = { type: 'surge', dist: 120, hp: 10, maxhp: 20, speed: 0, r: 12, slow: 0 };
  w.enemies.push(patch, hurt);
  E.step(w, 0.5);
  assert.ok(hurt.hp > 10, 'the wounded surge was mended');
  assert.equal(patch.hp, 20, 'the patch did not heal itself');
  assert.ok(hurt.healed > 0, 'and the shell can see it happen');
});

test('a patch never heals past full, and only reaches so far', () => {
  const w = richWorld();
  const patch = { type: 'patch', dist: 0, hp: 44, maxhp: 44, speed: 0, r: 13, slow: 0 };
  const full  = { type: 'surge', dist: 10, hp: 20, maxhp: 20, speed: 0, r: 12, slow: 0 };
  // far enough along the path to be outside HEAL_RADIUS in pixels
  const far   = { type: 'surge', dist: w.pathLen * 0.5, hp: 5, maxhp: 20, speed: 0, r: 12, slow: 0 };
  w.enemies.push(patch, full, far);
  const pp = E.enemyPos(w, patch), fp = E.enemyPos(w, far);
  assert.ok(Math.hypot(pp.x - fp.x, pp.y - fp.y) > E.HEAL_RADIUS, 'setup: out of reach');
  E.step(w, 2);
  assert.equal(full.hp, 20, 'a healthy enemy is left alone');
  assert.equal(far.hp, 5, 'and one out of range gets nothing');
});

/* ---------- tower synergy: Coil sets targets up ---------- */

test('a slowed enemy takes bonus damage, which is what Coil is for', () => {
  const clean = towerVsType('node', 'surge');
  const h0 = clean.e.hp; E.step(clean.w, 1 / 60);
  const normal = h0 - clean.e.hp;

  const brittle = towerVsType('node', 'surge');
  brittle.e.slow = 1; brittle.e.slowStrength = 0.5;   // as a Coil would leave it
  const b0 = brittle.e.hp; E.step(brittle.w, 1 / 60);
  const boosted = b0 - brittle.e.hp;

  assert.ok(boosted > normal, `slowed took ${boosted}, clean took ${normal}`);
  assert.ok(Math.abs(boosted - normal * E.SLOW_BRITTLE) < 1e-6, 'by exactly the brittle factor');
});

test('a Coil sets up the next tower rather than its own shot', () => {
  // the ordering that makes Coil support rather than a weak gun: its own hit is
  // resolved against the slow that was already there, not the one it applies
  const { w, e } = towerVsType('coil', 'surge');
  const s = stats0('coil');
  const hp0 = e.hp;
  E.step(w, 1 / 60);
  assert.equal(hp0 - e.hp, s.dmg, 'its own shot got no brittle bonus');
  assert.ok(e.slow > 0, 'but the target is now set up');
});

/* ---------- saving a run in progress ---------- */

test('a snapshot round-trips a run exactly', () => {
  const w = richWorld({ routeIndex: 2, seed: 1234 });
  // build a spread of towers and get a wave going
  let built = 0;
  for (let r = 0; r < w.L.ROWS && built < 5; r++)
    for (let c = 0; c < w.L.COLS && built < 5; c++)
      if (E.buildTower(w, c, r, E.TOWER_KEYS[built % 3])) { w.towers[built].level = 1 + built % 3; w.towers[built].xp = built * 2; built++; }
  E.startWave(w);
  for (let i = 0; i < 200; i++) E.step(w, 1 / 60);
  assert.ok(w.enemies.length > 0, 'setup: enemies are on the board');

  const snap = JSON.parse(JSON.stringify(E.snapshot(w)));   // as it would be stored
  const fresh = E.createWorld({ routeIndex: 0 });
  assert.equal(E.hydrate(fresh, snap), true);

  assert.equal(fresh.routeIndex, 2, 'the run keeps its own circuit');
  assert.equal(fresh.wave, w.wave);
  assert.equal(fresh.components, w.components);
  assert.equal(fresh.integrity, w.integrity);
  assert.equal(fresh.score, w.score);
  assert.deepEqual(fresh.towers.map(t => `${t.c},${t.r},${t.type},${t.level},${t.xp}`),
                   w.towers.map(t => `${t.c},${t.r},${t.type},${t.level},${t.xp}`));
  assert.deepEqual(fresh.enemies.map(e => `${e.type}:${e.dist.toFixed(3)}:${e.hp}`),
                   w.enemies.map(e => `${e.type}:${e.dist.toFixed(3)}:${e.hp}`));
  // the derived fields were rebuilt from routeIndex, not stored
  assert.deepEqual([...fresh.blocked].sort(), [...E.pathCells(fresh.L, 2)].sort());
  assert.ok(Math.abs(fresh.pathLen - E.buildPath(fresh.L, 2).pathLen) < 1e-9);
});

test('a restored run keeps playing identically', () => {
  const w = richWorld({ seed: 99 });
  let built = 0;
  for (let r = 0; r < w.L.ROWS && built < 6; r++)
    for (let c = 0; c < w.L.COLS && built < 6; c++)
      if (E.buildTower(w, c, r, 'node')) built++;
  E.startWave(w);
  for (let i = 0; i < 120; i++) E.step(w, 1 / 60);

  const resumed = E.createWorld();
  E.hydrate(resumed, JSON.parse(JSON.stringify(E.snapshot(w))));
  // run both on from the same point; they must stay in lockstep
  for (let i = 0; i < 300; i++) { E.step(w, 1 / 60); E.step(resumed, 1 / 60); }
  assert.equal(resumed.score, w.score, 'same score after playing on');
  assert.equal(resumed.integrity, w.integrity, 'same integrity');
  assert.equal(resumed.enemies.length, w.enemies.length, 'same enemies alive');
});

test('towers re-acquire after a restore, since aim cannot be serialised', () => {
  // `aim` holds a live enemy object; JSON cannot carry object identity, so it
  // is dropped and rebuilt. Safe only because step() re-acquires every frame.
  const w = towerVsEnemy('node');
  E.step(w, 1 / 60);
  assert.ok(w.towers[0].aim, 'setup: aiming at something');
  const snap = JSON.parse(JSON.stringify(E.snapshot(w)));
  assert.equal('aim' in snap.towers[0], false, 'aim is not stored');

  const fresh = E.createWorld();
  E.hydrate(fresh, snap);
  assert.equal(fresh.towers[0].aim, null, 'starts blank');
  E.step(fresh, 1 / 60);
  assert.ok(fresh.towers[0].aim, 'and is re-acquired on the next frame');
  assert.ok(fresh.enemies.includes(fresh.towers[0].aim), 'pointing at a real live enemy');
});

test('a corrupt or foreign snapshot is refused rather than half-applied', () => {
  const good = E.snapshot(richWorld());
  for (const bad of [
    null, undefined, 42, 'nope', {},
    { ...good, towers: 'not an array' },
    { ...good, routeIndex: 'B' },
    { ...good, towers: [{ c: 1, r: 1, type: 'deathray', level: 1 }] },
    { ...good, enemies: [{ type: 'kraken', dist: 0, hp: 1, maxhp: 1 }] },
  ]) {
    const w = E.createWorld();
    const before = JSON.stringify(E.snapshot(w));
    assert.equal(E.hydrate(w, bad), false, `should have refused: ${String(JSON.stringify(bad)).slice(0, 50)}`);
    assert.equal(JSON.stringify(E.snapshot(w)), before, 'and changed nothing');
  }
});

test('an out-of-range route index is wrapped, not trusted', () => {
  const w = E.createWorld();
  assert.equal(E.hydrate(w, { ...E.snapshot(w), routeIndex: 99 }), true);
  assert.ok(w.routeIndex >= 0 && w.routeIndex < E.ROUTE_COUNT);
});

/* ---------- enemies: movement, kills, leaks ---------- */

test('enemies advance along the path', () => {
  const w = E.createWorld();
  w.enemies.push({ type: 'surge', dist: 0, hp: 20, maxhp: 20, speed: 60, r: 12, slow: 0 });
  E.step(w, 0.5);
  assert.ok(Math.abs(w.enemies[0].dist - 30) < 1e-6, 'moved speed*dt');
});

test('a killed enemy pays bounty and score and is removed', () => {
  const w = E.createWorld();
  const comp0 = w.components, score0 = w.score;
  w.enemies.push({ type: 'surge', dist: 40, hp: -1, maxhp: 20, speed: 0, r: 12, slow: 0 });
  E.step(w, 1 / 60);
  assert.equal(w.enemies.length, 0, 'removed');
  assert.equal(w.components, comp0 + E.ENEMY_TYPES.surge.bounty);
  assert.equal(w.score, score0 + E.ENEMY_TYPES.surge.bounty);
});

test('an enemy reaching the core costs integrity', () => {
  const w = E.createWorld();
  const life0 = w.integrity;
  w.enemies.push({ type: 'surge', dist: w.pathLen, hp: 20, maxhp: 20, speed: 60, r: 12, slow: 0 });
  E.step(w, 1 / 60);
  assert.equal(w.integrity, life0 - 1);
  assert.equal(w.enemies.length, 0, 'the leaked enemy is gone');
});

test('losing the last integrity ends the run', () => {
  const w = E.createWorld();
  w.integrity = 1;
  w.enemies.push({ type: 'surge', dist: w.pathLen, hp: 20, maxhp: 20, speed: 60, r: 12, slow: 0 });
  E.step(w, 1 / 60);
  assert.equal(w.integrity, 0);
  assert.equal(w.over, true);
});

/* ---------- targeting priority ---------- */

test('priority decides which of several targets a tower picks', () => {
  const make = (priority) => {
    const w = richWorld();
    const { c, r, d } = overlook(w, 'node', 30);
    E.buildTower(w, c, r, 'node');
    w.towers[0].priority = priority;
    // a leader further along, a straggler behind it, and a tougher one between
    w.enemies.push({ type: 'surge', dist: d + 30, hp: 20, maxhp: 20, speed: 0, r: 12, slow: 0 });
    w.enemies.push({ type: 'surge', dist: d, hp: 20, maxhp: 20, speed: 0, r: 12, slow: 0 });
    w.enemies.push({ type: 'load', dist: d + 15, hp: 400, maxhp: 400, speed: 0, r: 19, slow: 0 });
    E.step(w, 1 / 60);
    return w.towers[0].aim;
  };
  assert.equal(make('first').dist, make('first').dist);
  assert.equal(make('first').type, 'surge');
  assert.ok(make('first').dist > make('last').dist, 'first is ahead of last');
  assert.equal(make('strongest').type, 'load', 'strongest goes for the big one');
});

test('an unset priority behaves as "first", so old saves still aim sensibly', () => {
  const w = richWorld();
  const { c, r, d } = overlook(w, 'node', 30);
  E.buildTower(w, c, r, 'node');
  delete w.towers[0].priority;
  w.enemies.push({ type: 'surge', dist: d, hp: 20, maxhp: 20, speed: 0, r: 12, slow: 0 });
  w.enemies.push({ type: 'surge', dist: d + 30, hp: 20, maxhp: 20, speed: 0, r: 12, slow: 0 });
  E.step(w, 1 / 60);
  assert.equal(w.towers[0].aim.dist, d + 30);
});

test('setPriority only accepts priorities it knows', () => {
  const w = richWorld();
  const cell = firstBuildable(w);
  E.buildTower(w, cell.c, cell.r, 'node');
  assert.equal(E.setPriority(w, 0, 'strongest'), true);
  assert.equal(w.towers[0].priority, 'strongest');
  assert.equal(E.setPriority(w, 0, 'nearest'), false, 'not a real mode');
  assert.equal(w.towers[0].priority, 'strongest', 'and it was left alone');
});

/* ---------- waves ---------- */

test('rush pulls the queued spawns forward without dropping any', () => {
  const w = richWorld();
  E.startWave(w);
  const before = w.spawnQueue.map(s => s.at);
  const total = w.spawnQueue.length;
  assert.equal(E.rushWave(w), true);
  assert.equal(w.spawnQueue.length, total, 'nothing was lost');
  const after = w.spawnQueue.map(s => s.at);
  assert.ok(after[after.length - 1] < before[before.length - 1], 'the tail arrives sooner');
  for (const t of after) assert.ok(t >= w.clock, 'and nothing was pushed into the past');
});

test('rushing again compresses again, so it can be leaned on', () => {
  const w = richWorld();
  E.startWave(w);
  const last = () => w.spawnQueue[w.spawnQueue.length - 1].at;
  const a = last(); E.rushWave(w);
  const b = last(); E.rushWave(w);
  assert.ok(b < a && last() < b);
});

test('there is nothing to rush between waves', () => {
  const w = richWorld();
  assert.equal(E.rushWave(w), false, 'no wave running');
  E.startWave(w);
  w.spawnQueue = [];
  assert.equal(E.rushWave(w), false, 'everything already out');
});

test('wave groups overlap instead of queueing end to end', () => {
  // Wave 9 has several types unlocked, so there is something to overlap.
  const w = richWorld();
  w.wave = 8;
  E.startWave(w);
  const byType = new Map();
  for (const s of w.spawnQueue) {
    const e = byType.get(s.type) || { first: Infinity, last: -Infinity };
    e.first = Math.min(e.first, s.at); e.last = Math.max(e.last, s.at);
    byType.set(s.type, e);
  }
  const spans = [...byType.values()].sort((a, b) => a.first - b.first);
  assert.ok(spans.length >= 3, 'several types this deep');
  const overlaps = spans.filter((s, i) => i > 0 && s.first < spans[i - 1].last);
  assert.ok(overlaps.length > 0, 'at least one group opens before the last one finishes');
});

test('a deep wave brings second releases, not just longer queues', () => {
  const count = (wave, type) =>
    E.wavePlan(wave).filter(g => g.type === type).length;
  assert.equal(count(11, 'surge'), 1, 'one surge group before the threshold');
  assert.equal(count(12, 'surge'), 2, 'and a second release after it');
});

test('wavePlan escalates and introduces tougher types over time', () => {
  const w1 = E.wavePlan(1), w6 = E.wavePlan(6);
  assert.ok(w1.length >= 1);
  assert.equal(w1[0].type, 'surge');
  assert.ok(w6.length > w1.length, 'more groups later');
  assert.ok(w6.some(g => g.type === 'load'), 'loads arrive by wave 6');
  assert.ok(E.hpScale(10) > E.hpScale(1), 'enemies toughen');
});

test('startWave queues spawns and step releases them over time', () => {
  const w = E.createWorld();
  assert.equal(E.startWave(w), true);
  assert.equal(w.wave, 1);
  assert.ok(w.waveActive);
  assert.equal(w.betweenWaves, false);
  assert.ok(w.spawnQueue.length > 0);
  assert.equal(w.enemies.length, 0, 'nothing out yet');
  E.step(w, 0.01);
  assert.equal(w.enemies.length, 1, 'the first surge is released at t=0');
});

test('startWave works mid-wave, overlapping rather than queuing after', () => {
  const w = E.createWorld();
  E.startWave(w);
  E.step(w, 5);   // let some of wave 1 release and the clock advance
  const releasedSoFar = w.enemies.length;
  const remainingWave1 = w.spawnQueue.length;

  assert.equal(E.startWave(w), true, 'starting early works mid-wave');
  assert.equal(w.wave, 2);
  assert.ok(w.waveActive, 'still (or again) active');
  // wave 2's spawns are appended, not a replacement — the old queue's
  // still-pending entries survive alongside the new ones
  assert.ok(w.spawnQueue.length > remainingWave1,
    'wave 2 spawns were appended onto whatever wave 1 had left');
  assert.equal(w.enemies.length, releasedSoFar, 'nothing already on the board was touched');
});

test('stepping the same world twice per frame is what fast-forward is', () => {
  /* The shell's fast-forward calls `step` N times per frame rather than
     handing it N× the dt — a 4× dt would overshoot the sub-step sizes the
     spawn and collision code assume. This pins the property that makes that
     safe: N normal steps land where N frames of normal play would. */
  const slow = E.createWorld({ seed: 7 });
  const fast = E.createWorld({ seed: 7 });
  E.startWave(slow); E.startWave(fast);

  for (let i = 0; i < 8; i++) E.step(slow, 1 / 60);
  for (let i = 0; i < 4; i++) { E.step(fast, 1 / 60); E.step(fast, 1 / 60); }

  assert.equal(fast.clock.toFixed(6), slow.clock.toFixed(6), 'same elapsed time');
  assert.equal(fast.enemies.length, slow.enemies.length, 'same enemies released');
});

test('clearing a wave flags betweenWaves and pays a bonus', () => {
  const w = E.createWorld();
  E.startWave(w);
  w.spawnQueue = [];            // pretend everything has spawned
  w.enemies = [];               // and been dealt with
  const score0 = w.score;
  E.step(w, 1 / 60);
  assert.equal(w.waveActive, false);
  assert.equal(w.betweenWaves, true);
  assert.ok(w.score > score0, 'clear bonus');
});

/* ---------- rotation ---------- */

test('relayout transposes towers and keeps enemy progress, lossless', () => {
  const w = richWorld();
  E.startWave(w);
  // build a couple of towers on known cells
  const a = firstBuildable(w);
  E.buildTower(w, a.c, a.r, 'node');
  // an enemy partway along the path
  w.enemies.push({ type: 'surge', dist: w.pathLen * 0.4, hp: 15, maxhp: 20, speed: 60, r: 12, slow: 0 });
  const enemyDist = w.enemies[0].dist;
  const comp = w.components, integ = w.integrity, wave = w.wave, score = w.score;
  const tc = { c: w.towers[0].c, r: w.towers[0].r };

  E.relayout(w, TALL);

  assert.equal(w.L, TALL, 'moved to portrait');
  assert.deepEqual({ c: w.towers[0].c, r: w.towers[0].r }, { c: tc.r, r: tc.c }, 'tower transposed');
  assert.ok(Math.abs(w.enemies[0].dist - enemyDist) < 1e-9, 'enemy distance unchanged');
  assert.equal(w.components, comp); assert.equal(w.integrity, integ);
  assert.equal(w.wave, wave); assert.equal(w.score, score);
  // the transposed tower still sits on a legal, non-path cell of the new board
  assert.ok(E.inGrid(TALL, w.towers[0].c, w.towers[0].r));
});

test('rotating out and back returns the tower to its cell', () => {
  const w = richWorld();
  const a = firstBuildable(w);
  E.buildTower(w, a.c, a.r, 'coil');
  E.relayout(w, TALL);
  E.relayout(w, L);
  assert.deepEqual({ c: w.towers[0].c, r: w.towers[0].r }, a);
});

/* ---------- full-run sanity ---------- */

test('a scripted run survives several waves without corrupting state', () => {
  const w = richWorld({ seed: 4242 });
  // ring the whole path with nodes so waves actually get cleared
  let built = 0;
  for (let r = 0; r < w.L.ROWS && built < 24; r++) {
    for (let c = 0; c < w.L.COLS && built < 24; c++) {
      if (E.buildTower(w, c, c === 0 ? r : r, 'node')) built++;
    }
  }
  assert.ok(built > 0, 'placed some towers');

  for (let wave = 0; wave < 4 && !w.over; wave++) {
    E.startWave(w);
    let guard = 0;
    while (w.waveActive && guard++ < 20000) {
      E.step(w, 1 / 60);
      // invariants every frame
      for (const e of w.enemies) {
        assert.ok(e.dist >= 0, 'never behind the start');
        assert.ok(Number.isFinite(e.hp));
      }
      assert.ok(w.integrity >= 0 && w.integrity <= E.START_INTEGRITY);
      assert.ok(w.components >= 0);
      if (w.over) break;
    }
    assert.ok(guard < 20000, `wave ${wave + 1} terminated`);
  }
  assert.ok(true, 'ran without an assertion firing');
});
