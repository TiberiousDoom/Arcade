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

test('a run picks its route from the seed, so a seed still replays exactly', () => {
  const a = E.createWorld({ seed: 5 });
  const b = E.createWorld({ seed: 5 });
  assert.equal(a.routeIndex, b.routeIndex, 'same seed, same circuit');
  assert.equal(E.createWorld({ routeIndex: 2 }).routeIndex, 2, 'and it can be forced');
  // the world's path really is the chosen route's, not always route 0
  const w = E.createWorld({ routeIndex: 1 });
  assert.ok(Math.abs(w.pathLen - E.buildPath(L, 1).pathLen) < 1e-9);
  assert.deepEqual([...w.blocked].sort(), [...E.pathCells(L, 1)].sort());
});

test('playing again moves to the next circuit', () => {
  const w = E.createWorld({ routeIndex: 0 });
  E.resetGame(w);
  assert.equal(w.routeIndex, 1, 'a replay is a different board');
  assert.deepEqual([...w.blocked].sort(), [...E.pathCells(w.L, 1)].sort(), 'and blocked cells followed');
  // and it wraps rather than running off the end
  const last = E.createWorld({ routeIndex: E.ROUTE_COUNT - 1 });
  E.resetGame(last);
  assert.equal(last.routeIndex, 0);
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

/* ---------- enemy abilities: making a favourite tower the wrong answer ---------- */

/** Park an enemy of `type` inside a fresh tower's range and return both. */
function towerVsType(towerType, enemyType, hp = 500) {
  const w = richWorld();
  const cell = firstBuildable(w);
  E.buildTower(w, cell.c, cell.r, towerType);
  const tc = E.cellCenter(w.L, cell.c, cell.r);
  const s = stats0(towerType);
  let d = null;
  for (let k = 0; k < w.pathLen; k += 3) {
    const p = E.atS(w.path, w.pathLen, k);
    if (Math.hypot(p.x - tc.x, p.y - tc.y) <= s.range) { d = k; break; }
  }
  assert.ok(d !== null, 'a path point exists within range');
  const T = E.ENEMY_TYPES[enemyType];
  const e = { type: enemyType, dist: d, hp, maxhp: hp, speed: 0, r: T.r, slow: 0 };
  w.enemies.push(e);
  return { w, e };
}

test('armour blunts small hits far more than heavy ones', () => {
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
  // but Node is not written off — upgrading it is a real answer
  const t2 = E.TOWER_TYPES.node.tiers[2];
  assert.ok(t2.dmg - armor > (stats0('node').dmg - armor) * 2, 'a maxed Node gets meaningfully through');
});

test('armour never absorbs a hit completely', () => {
  const { w, e } = towerVsType('coil', 'shell');   // coil dmg is below shell armour
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
    const cell = firstBuildable(w);
    E.buildTower(w, cell.c, cell.r, 'breaker');
    const tc = E.cellCenter(w.L, cell.c, cell.r);
    const s = stats0('breaker');
    let d = null;
    for (let k = 0; k < w.pathLen; k += 3) {
      const p = E.atS(w.path, w.pathLen, k);
      if (Math.hypot(p.x - tc.x, p.y - tc.y) <= s.range) { d = k; break; }
    }
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

test('a patch repairs its neighbours but not itself', () => {
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
      if (E.buildTower(w, c, r, E.TOWER_KEYS[built % 3])) { w.towers[built].tier = built % 3; built++; }
  E.startWave(w);
  for (let i = 0; i < 200; i++) E.step(w, 1 / 60);
  assert.ok(w.enemies.length > 0, 'setup: enemies are on the board');

  const snap = JSON.parse(JSON.stringify(E.snapshot(w)));   // as it would be stored
  const fresh = E.createWorld({ routeIndex: 0 });
  assert.equal(E.hydrate(fresh, snap), true);

  assert.equal(fresh.routeIndex, 2, 'the run keeps its own circuit');
  assert.equal(fresh.wave, w.wave);
  assert.equal(fresh.charge, w.charge);
  assert.equal(fresh.integrity, w.integrity);
  assert.equal(fresh.score, w.score);
  assert.deepEqual(fresh.towers.map(t => `${t.c},${t.r},${t.type},${t.tier}`),
                   w.towers.map(t => `${t.c},${t.r},${t.type},${t.tier}`));
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
    { ...good, towers: [{ c: 1, r: 1, type: 'deathray', tier: 0 }] },
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
