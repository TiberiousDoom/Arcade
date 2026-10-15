import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.js';

const L = E.LAYOUT;
const run = (w, secs, dt = 1 / 60) => { for (let t = 0; t < secs; t += dt) E.step(w, dt); };
const live = (opts) => { const w = E.createWorld(opts); w.running = true; return w; };

/** Kill every invader except those listed as [c, r]. */
function leaveOnly(w, keep) {
  w.formation.alive = w.formation.alive.map(() => false);
  for (const [c, r] of keep) w.formation.alive[r * E.COLS + c] = true;
}

/* ---------- board and setup ---------- */

test('the board is portrait, with the gun above a thumb band', () => {
  assert.ok(L.H > L.W);
  assert.ok(L.GUN_Y < L.GROUND_Y && L.GROUND_Y < L.H - 120, 'room under the ground for a thumb');
  assert.ok(E.BUNKER_Y + E.BUNKER_ROWS * E.CELL < L.GUN_Y - 20, 'bunkers stand clear above the gun');
});

test('a new world: a full formation, four whole bunkers, three lives, nothing moving', () => {
  const w = E.createWorld();
  assert.equal(E.aliveCount(w), E.COLS * E.ROWS);
  assert.equal(w.bunkers.length, E.BUNKERS);
  assert.equal(w.lives, E.START_LIVES);
  assert.equal(w.running, false);
});

test('the formation fits the board with room to march', () => {
  const w = E.createWorld();
  const e = E.extent(w);
  assert.ok(e.left > L.WALL && e.right < L.W - L.WALL);
  assert.ok(e.right - e.left < L.W * 0.75, 'and space either side to sweep across');
});

test('bunkers have the arch: clipped corners and a doorway', () => {
  assert.equal(E.bunkerShape(0, 0), 0, 'top corner clipped');
  assert.equal(E.bunkerShape(7, 0), 1, 'top middle solid');
  assert.equal(E.bunkerShape(7, E.BUNKER_ROWS - 1), 0, 'doorway at the bottom');
  assert.equal(E.bunkerShape(0, E.BUNKER_ROWS - 1), 1, 'legs solid');
});

test('bunkers sit evenly across the board, inside it', () => {
  const xs = Array.from({ length: E.BUNKERS }, (_, b) => E.bunkerX(L, b));
  assert.ok(xs[0] > 0 && xs.at(-1) + E.BUNKER_COLS * E.CELL < L.W);
  const gaps = xs.slice(1).map((x, i) => x - xs[i]);
  assert.ok(gaps.every(g => Math.abs(g - gaps[0]) < 1e-9));
});

/* ---------- the gun ---------- */

test('the gun is clamped inside the walls', () => {
  const w = E.createWorld();
  E.setGun(w, -500);
  assert.ok(w.gun.x >= L.WALL + E.GUN_W / 2);
  E.setGun(w, 5000);
  assert.ok(w.gun.x <= L.W - L.WALL - E.GUN_W / 2);
  const x = w.gun.x;
  E.nudgeGun(w, -30);
  assert.equal(w.gun.x, x - 30);
});

test('one shot in the air at a time', () => {
  const w = live();
  assert.equal(E.fire(w), true);
  assert.equal(E.fire(w), false, 'the second waits for the first');
  run(w, 1.2);
  assert.equal(w.shot, null);
  assert.equal(E.fire(w), true, 'and is free again once it has gone');
});

test('no firing while not running, or while the gun is down', () => {
  const w = E.createWorld();
  assert.equal(E.fire(w), false);
  w.running = true;
  w.gun.dead = 1;
  assert.equal(E.fire(w), false);
});

/* ---------- the formation ---------- */

test('it marches sideways, and drops and turns at a wall', () => {
  const w = live();
  w.bombT = 1e9; w.saucerT = 1e9;
  const x0 = w.formation.x, y0 = w.formation.y;
  run(w, 1);
  assert.ok(w.formation.x > x0, 'marching right');
  assert.equal(w.formation.y, y0);
  run(w, 20);
  assert.ok(w.formation.y > y0, 'it has dropped');
});

test('it marches faster as it thins', () => {
  const total = E.COLS * E.ROWS;
  assert.ok(E.stepInterval(1, total, 1) < E.stepInterval(total, total, 1) / 5);
  assert.ok(E.stepInterval(total, total, 6) < E.stepInterval(total, total, 1), 'and later waves start brisker');
});

test('each wave starts lower, to a limit', () => {
  const w = E.createWorld();
  const y1 = w.formation.y;
  w.waveClear = true; E.nextWave(w);
  assert.equal(w.formation.y, y1 + E.WAVE_LOWER);
  for (let i = 0; i < 20; i++) { w.waveClear = true; E.nextWave(w); }
  assert.equal(w.formation.y, y1 + E.LOWER_MAX * E.WAVE_LOWER);
});

test('a formation that reaches the gun line ends the run', () => {
  const w = live();
  w.bombT = 1e9;
  w.formation.y = L.FLOOR - (E.ROWS - 1) * E.ROW_GAP - E.INV_SIZE / 2 - 5;
  w.formation.x = L.WALL + 1;                // against the wall, so the next step drops
  w.formation.dir = -1;
  run(w, 2);
  assert.equal(w.over, true);
});

test('invaders that reach a bunker grind it away', () => {
  const w = live();
  w.bombT = 1e9;
  leaveOnly(w, [[0, 4]]);
  const bx = E.bunkerX(L, 0) + 20;
  w.formation.x = bx;
  w.formation.y = E.BUNKER_Y + 10 - 4 * E.ROW_GAP;
  const before = E.bunkerCells(w, 0);
  E.step(w, 1 / 60);
  assert.ok(E.bunkerCells(w, 0) < before);
});

/* ---------- shooting ---------- */

test('a shot destroys the lowest invader in its path and scores its row', () => {
  const kills = [];
  const w = live({ fx: { kill: (x, y, kind) => kills.push(kind) } });
  w.bombT = 1e9;
  leaveOnly(w, [[3, 0], [3, 4]]);
  const p = E.invPos(w, 3, 4);
  w.shot = { x: p.x, y: p.y + 30 };
  E.step(w, 1 / 60);
  assert.equal(w.formation.alive[4 * E.COLS + 3], false, 'the bottom one');
  assert.equal(w.formation.alive[3], true, 'not the one behind it');
  assert.equal(w.score, E.ROW_POINTS[4]);
  assert.deepEqual(kills, [E.rowKind(4)]);
});

test('the top row is worth the most', () => {
  assert.ok(E.ROW_POINTS[0] > E.ROW_POINTS[4]);
});

test('at 30fps a shot cannot step over an invader, a saucer or a bomb', () => {
  // a 30fps step carries the shot further than an invader's box is tall
  assert.ok(E.SHOT_SPEED / 30 > E.INV_SIZE + 8, 'setup: the step really is longer than the box');
  for (let start = 0; start < 40; start += 5) {
    const w = live();
    leaveOnly(w, [[3, 4]]);
    const p = E.invPos(w, 3, 4);
    w.bombT = 99; w.saucerT = 99;
    w.shot = { x: p.x, y: p.y + 30 + start };
    for (let i = 0; i < 6 && w.shot; i++) E.step(w, 1 / 30);
    assert.equal(E.aliveCount(w), 0, `missed from ${start}px further down`);
  }
  for (let start = 0; start < 40; start += 5) {
    const w = live();
    w.bombT = 99; w.saucerT = 99;
    w.saucer = { x: 300, dir: 0, points: 100 };
    w.shot = { x: 300, y: E.SAUCER_Y + 30 + start };
    for (let i = 0; i < 6 && w.shot; i++) E.step(w, 1 / 30);
    assert.equal(w.saucer, null, `the saucer was missed from ${start}px further down`);
  }
  for (let start = 0; start < 40; start += 5) {
    const w = live();
    w.bombT = 99; w.saucerT = 99;
    w.bombs = [{ x: 41, y: 500 }];                 // a lane clear of the bunkers
    w.shot = { x: 41, y: 560 + start };
    E.step(w, 1 / 30);
    E.step(w, 1 / 30);
    assert.equal(w.bombs.length, 0, `the bomb was missed from ${start}px further down`);
  }
});

test('a shot that meets a bunker bites a hole and stops', () => {
  const w = live();
  w.bombT = 1e9;
  const x = E.bunkerX(L, 1) + 7;          // a solid leg, not the doorway
  const before = E.bunkerCells(w, 1);
  w.shot = { x, y: E.BUNKER_Y + E.BUNKER_ROWS * E.CELL + 4 };
  E.step(w, 1 / 60);
  assert.equal(w.shot, null);
  assert.ok(E.bunkerCells(w, 1) < before);
});

test('a shot and a bomb that meet cancel out', () => {
  const w = live();
  w.bombT = 1e9;
  w.bombs = [{ x: 100, y: 500 }];
  w.shot = { x: 100, y: 515 };
  E.step(w, 1 / 60);
  assert.equal(w.shot, null);
  assert.equal(w.bombs.length, 0);
});

test('the saucer crosses, pays well when hit, and leaves', () => {
  const kills = [];
  const w = live({ fx: { saucerKill: (x, y, pts) => kills.push(pts) } });
  w.bombT = 1e9;
  w.saucerT = 0.001;
  E.step(w, 1 / 60);
  assert.ok(w.saucer, 'it appeared');
  assert.ok(E.SAUCER_POINTS.includes(w.saucer.points));
  const pts = w.saucer.points;
  w.shot = { x: w.saucer.x, y: E.SAUCER_Y + 8 };
  E.step(w, 1 / 60);
  assert.deepEqual(kills, [pts]);
  assert.equal(w.score, pts);
});

test('an extra life once, at the threshold', () => {
  const w = live();
  w.bombT = 1e9;
  w.score = E.EXTRA_LIFE_AT - 10;
  leaveOnly(w, [[0, 0], [1, 0]]);
  w.shot = { x: E.invPos(w, 0, 0).x, y: E.invPos(w, 0, 0).y + 20 };
  E.step(w, 1 / 60);
  assert.equal(w.lives, E.START_LIVES + 1);
  w.shot = { x: E.invPos(w, 1, 0).x, y: E.invPos(w, 1, 0).y + 20 };
  E.step(w, 1 / 60);
  assert.equal(w.lives, E.START_LIVES + 1, 'and only once');
});

/* ---------- invader fire ---------- */

test('a bomb that reaches the gun costs a life and clears the air', () => {
  const w = live();
  w.bombT = 1e9;
  w.bombs = [{ x: w.gun.x, y: L.GUN_Y - 12 }, { x: 50, y: 300 }];
  E.step(w, 1 / 60);
  assert.equal(w.lives, E.START_LIVES - 1);
  assert.equal(w.bombs.length, 0);
  assert.ok(w.gun.dead > 0, 'the gun is down for a moment');
  run(w, E.RESPAWN + 0.1);
  assert.equal(w.gun.dead, 0, 'and comes back');
});

test('a bomb cannot hit a gun that is down', () => {
  const w = live();
  w.bombT = 1e9;
  w.gun.dead = 1;
  w.bombs = [{ x: w.gun.x, y: L.GUN_Y - 12 }];
  E.step(w, 1 / 60);
  assert.equal(w.lives, E.START_LIVES);
});

test('the last life lost ends the run', () => {
  const w = live();
  w.bombT = 1e9;
  w.lives = 1;
  w.bombs = [{ x: w.gun.x, y: L.GUN_Y - 12 }];
  E.step(w, 1 / 60);
  assert.equal(w.over, true);
});

test('bombs fall from the bottom invader of a standing column, and never more than the cap', () => {
  const w = live();
  w.saucerT = 1e9;
  run(w, 30);
  const f = w.formation;
  assert.ok(w.bombs.length <= E.BOMB_MAX(1));
  // every live bomb is in a column that still has invaders
  for (const b of w.bombs) {
    const c = Math.round((b.x - f.x) / E.COL_GAP);
    assert.ok(c >= 0 && c < E.COLS);
  }
});

test('later waves fire faster, more often, and more of it aimed', () => {
  assert.ok(E.BOMB_SPEED(8) > E.BOMB_SPEED(1));
  assert.ok(E.BOMB_GAP(8) < E.BOMB_GAP(1));
  assert.ok(E.BOMB_MAX(9) > E.BOMB_MAX(1));
  assert.ok(E.AIMED(4) > E.AIMED(1) && E.AIMED(99) <= 0.5);
});

/* ---------- randomness ---------- */

test('the same seed plays the same', () => {
  const a = live({ seed: 5 }), b = live({ seed: 5 });
  run(a, 15); run(b, 15);
  assert.deepEqual(a.bombs, b.bombs);
  assert.equal(a.seed, b.seed);
});

test('what the player does never changes how many rolls are taken', () => {
  /* Played, not staged — the lesson from Airburst. One run fires as fast as it
     can and wanders; the other stands still and never fires. After the same
     time the LCG must be in the same place: rolls are taken on timers, and
     what they are mapped onto (which column, whether aimed) never adds one. */
  const busy = live({ seed: 9 }), idle = live({ seed: 9 });
  busy.lives = idle.lives = 99;
  for (let i = 0; i < 60 * 12; i++) {
    E.setGun(busy, 100 + (i * 7) % 400);
    E.fire(busy);
    E.step(busy, 1 / 60); E.step(idle, 1 / 60);
  }
  assert.ok(E.aliveCount(busy) < E.aliveCount(idle), 'the busy run did shoot things');
  assert.equal(busy.seed, idle.seed);
});

test('bunker damage costs no rolls', () => {
  const a = live({ seed: 4 }), b = live({ seed: 4 });
  b.bunkers[0] = b.bunkers[0].map(() => 0);   // one run has lost a bunker entirely
  run(a, 10); run(b, 10);
  assert.equal(a.seed, b.seed);
});

/* ---------- waves ---------- */

test('clearing the formation holds the wave', () => {
  const w = live();
  leaveOnly(w, []);
  E.step(w, 1 / 60);
  assert.equal(w.waveClear, true);
  assert.equal(w.wavesCleared, 1);
  assert.equal(w.running, false);
});

test('the next wave rebuilds the formation and the bunkers', () => {
  const w = live();
  w.bunkers[2] = w.bunkers[2].map(() => 0);
  leaveOnly(w, []);
  E.step(w, 1 / 60);
  assert.equal(E.nextWave(w), true);
  assert.equal(w.wave, 2);
  assert.equal(E.aliveCount(w), E.COLS * E.ROWS);
  assert.ok(E.bunkerCells(w, 2) > 0, 'the bunker is back');
});

test('a reset is a fresh wave 1', () => {
  const w = live();
  w.score = 900; w.wave = 4; w.lives = 1; w.over = true;
  E.resetGame(w);
  assert.equal(w.wave, 1); assert.equal(w.score, 0); assert.equal(w.lives, E.START_LIVES);
  assert.equal(w.over, false);
});

/* ---------- saving ---------- */

test('a snapshot round-trips through JSON and plays on identically', () => {
  const w = live({ seed: 12 });
  run(w, 8);
  E.fire(w);
  w.bunkers[1][20] = 0;
  const r = E.createWorld();
  assert.equal(E.hydrate(r, JSON.parse(JSON.stringify(E.snapshot(w)))), true);
  assert.equal(r.running, false);
  assert.deepEqual(r.formation.alive, w.formation.alive);
  assert.equal(r.bunkers[1][20], 0);
  r.running = true;
  run(w, 5); run(r, 5);
  assert.deepEqual(r.bombs, w.bombs);
  assert.equal(r.score, w.score);
  assert.equal(r.seed, w.seed);
});

test('a corrupt or foreign snapshot is refused rather than half-applied', () => {
  const good = E.snapshot(E.createWorld());
  for (const bad of [null, 3, {}, { ...good, wave: 0 }, { ...good, formation: { ...good.formation, alive: '11' } },
    { ...good, bunkers: ['1'] }, { ...good, bombs: 'x' }]) {
    const w = E.createWorld();
    w.score = 77;
    assert.equal(E.hydrate(w, bad), false);
    assert.equal(w.score, 77);
  }
});

/* ---------- full runs ---------- */

/** A player: leads the formation, keeps out of lanes behind its own bunkers,
 *  and dodges a bomb it has noticed — after `react` seconds, once the bomb is
 *  within `window` px of the gun. Measured with this player: never dodging
 *  dies by wave 1-4; reacting in 0.35s from 120px dies by wave 2-4; reacting
 *  in 0.2s from 150px clears ten waves. */
function player(seed, { react = 0.2, window = 150, waves = 6 } = {}) {
  const w = live({ seed });
  const covered = (x) => {
    for (let y = E.BUNKER_Y; y < E.BUNKER_Y + E.BUNKER_ROWS * E.CELL; y += E.CELL) if (E.cellAt(w, x, y)) return true;
    return false;
  };
  const seen = new Map();
  let held = 0;
  for (let f = 0; f < 60 * 60 * 10 && !w.over && held < waves; f++) {
    const now = f / 60;
    for (const b of w.bombs) if (b.y > L.GUN_Y - window && !seen.has(b)) seen.set(b, now);
    const threat = w.bombs.find(b => seen.has(b) && now - seen.get(b) >= react && Math.abs(b.x - w.gun.x) < E.GUN_W * 0.8);
    let target = w.gun.x;
    if (threat) target = w.gun.x + (threat.x > w.gun.x ? -70 : 70);
    else {
      let best = null, bd = Infinity;
      for (let c = 0; c < E.COLS; c++) for (let r = E.ROWS - 1; r >= 0; r--) {
        if (!w.formation.alive[r * E.COLS + c]) continue;
        const p = E.invPos(w, c, r);
        const travel = (L.GUN_Y - p.y) / E.SHOT_SPEED;
        const lead = p.x + w.formation.dir * E.STEP_X * travel / E.stepInterval(E.aliveCount(w), E.COLS * E.ROWS, w.wave);
        const d = Math.abs(lead - w.gun.x) + (covered(lead) ? 120 : 0);
        if (d < bd) { bd = d; best = lead; }
        break;
      }
      if (best !== null) target = best;
    }
    E.nudgeGun(w, Math.sign(target - w.gun.x) * Math.min(Math.abs(target - w.gun.x), E.GUN_SPEED / 60));
    if (!threat && Math.abs(target - w.gun.x) < 6) E.fire(w);
    E.step(w, 1 / 60);
    if (w.waveClear) { held++; E.nextWave(w); w.running = true; }
    assert.ok(w.bombs.length <= E.BOMB_MAX(w.wave));
  }
  return { held, w };
}

test('an attentive player holds five waves — the wave that will open Bulkhead', () => {
  const { held } = player(3, { waves: 5 });
  assert.equal(held, 5);
});

test('a player who never dodges is worn down: the bombs matter', () => {
  const { held, w } = player(3, { window: -1e9, waves: 6 });
  assert.equal(w.over, true, `never dodging should end the run (held ${held})`);
  assert.ok(held < 5);
});
