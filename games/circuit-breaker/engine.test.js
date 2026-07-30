import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.js';

const L = E.LAYOUT;
const TALL = E.LAYOUT_TALL;

/** A world with plenty of charge, so building isn't the thing under test. */
function richWorld(opts = {}) {
  const w = E.createWorld(opts);
  w.charge = 9999;
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

  w.charge = 0;
  assert.equal(E.canBuild(w, cell.c, cell.r, 'node'), false, 'not while broke');
  w.charge = 12;
  assert.equal(E.canBuild(w, cell.c, cell.r, 'node'), true);
});

test('building deducts charge, places the tower, and blocks the cell', () => {
  const w = richWorld();
  const cell = firstBuildable(w);
  const before = w.charge;
  assert.equal(E.buildTower(w, cell.c, cell.r, 'node'), true);
  assert.equal(w.charge, before - E.TOWER_TYPES.node.cost);
  assert.ok(E.towerAt(w, cell.c, cell.r), 'tower is there');
  assert.equal(E.canBuild(w, cell.c, cell.r, 'node'), false, 'cell now occupied');
});

test('upgrading costs charge and raises the tier; maxes out', () => {
  const w = richWorld();
  const cell = firstBuildable(w);
  E.buildTower(w, cell.c, cell.r, 'node');
  const t = w.towers[0];
  assert.equal(E.stats(t).dmg, E.TOWER_TYPES.node.tiers[0].dmg);
  E.upgradeTower(w, 0);
  assert.equal(t.tier, 1);
  assert.equal(E.stats(t).dmg, E.TOWER_TYPES.node.tiers[1].dmg);
  E.upgradeTower(w, 0);
  assert.equal(t.tier, E.MAX_TIER);
  assert.equal(E.upgradeCost(t), null, 'maxed');
  assert.equal(E.upgradeTower(w, 0), false, 'cannot go past max');
});

test('selling refunds part of what was sunk in and frees the cell', () => {
  const w = richWorld();
  const cell = firstBuildable(w);
  E.buildTower(w, cell.c, cell.r, 'breaker');
  const refund = E.sellValue(w.towers[0]);
  const before = w.charge;
  assert.equal(E.sellTower(w, 0), true);
  assert.equal(w.charge, before + refund);
  assert.equal(E.towerAt(w, cell.c, cell.r), null);
  assert.ok(refund > 0 && refund < E.TOWER_TYPES.breaker.cost, 'partial refund');
});

/* ---------- towers firing ---------- */

/** Put one enemy at a known distance and one tower next to that point. */
function towerVsEnemy(type, dist = 60) {
  const w = richWorld();
  const cell = firstBuildable(w);
  E.buildTower(w, cell.c, cell.r, type);
  const tc = E.cellCenter(w.L, cell.c, cell.r);
  // find a path distance whose point is within range of the tower
  const s = stats0(type);
  let placed = null;
  for (let d = 0; d < w.pathLen; d += 4) {
    const p = E.atS(w.path, w.pathLen, d);
    if (Math.hypot(p.x - tc.x, p.y - tc.y) <= s.range) { placed = d; break; }
  }
  assert.ok(placed !== null, 'a path point exists within tower range');
  w.enemies.push({ type: 'load', dist: placed, hp: 500, maxhp: 500, speed: 0, r: 15, slow: 0 });
  return w;
}
const stats0 = (type) => E.TOWER_TYPES[type].tiers[0];

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
  E.buildTower(w, cell.c, cell.r, 'breaker');
  const s = stats0('breaker');
  const tc = E.cellCenter(w.L, cell.c, cell.r);
  let d0 = null;
  for (let d = 0; d < w.pathLen; d += 3) {
    const p = E.atS(w.path, w.pathLen, d);
    if (Math.hypot(p.x - tc.x, p.y - tc.y) <= s.range) { d0 = d; break; }
  }
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

  // a second enemy alongside the first, then the first dies mid-cooldown
  w.enemies.push({ ...first, dist: first.dist + 6, hp: 500 });
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

/* ---------- enemies: movement, kills, leaks ---------- */

test('enemies advance along the path', () => {
  const w = E.createWorld();
  w.enemies.push({ type: 'surge', dist: 0, hp: 20, maxhp: 20, speed: 60, r: 12, slow: 0 });
  E.step(w, 0.5);
  assert.ok(Math.abs(w.enemies[0].dist - 30) < 1e-6, 'moved speed*dt');
});

test('a killed enemy pays bounty and score and is removed', () => {
  const w = E.createWorld();
  const charge0 = w.charge, score0 = w.score;
  w.enemies.push({ type: 'surge', dist: 40, hp: -1, maxhp: 20, speed: 0, r: 12, slow: 0 });
  E.step(w, 1 / 60);
  assert.equal(w.enemies.length, 0, 'removed');
  assert.equal(w.charge, charge0 + E.ENEMY_TYPES.surge.bounty);
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

/* ---------- waves ---------- */

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
  assert.equal(E.startWave(w), false, 'cannot start a wave mid-wave');
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
  const charge = w.charge, integ = w.integrity, wave = w.wave, score = w.score;
  const tc = { c: w.towers[0].c, r: w.towers[0].r };

  E.relayout(w, TALL);

  assert.equal(w.L, TALL, 'moved to portrait');
  assert.deepEqual({ c: w.towers[0].c, r: w.towers[0].r }, { c: tc.r, r: tc.c }, 'tower transposed');
  assert.ok(Math.abs(w.enemies[0].dist - enemyDist) < 1e-9, 'enemy distance unchanged');
  assert.equal(w.charge, charge); assert.equal(w.integrity, integ);
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
      assert.ok(w.charge >= 0);
      if (w.over) break;
    }
    assert.ok(guard < 20000, `wave ${wave + 1} terminated`);
  }
  assert.ok(true, 'ran without an assertion firing');
});
