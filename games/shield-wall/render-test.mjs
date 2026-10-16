/* Draw-path smoke test: boots the real shell against a real canvas and pushes
   every visual state through it. The engine suite proves the rules; this proves
   the game can be looked at, and that the one-finger control does what it says.

   Needs `npm install --no-save jsdom canvas`.
   Run: node --test games/shield-wall/render-test.mjs
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { bootAndStart } from '../../tools/render-harness.mjs';

const SHELL = fileURLToPath(new URL('./shield-wall.html', import.meta.url));

/* The thumb band's two controls, in board coordinates (the harness maps them
   1:1): the stick's centre bottom left, the fire button bottom right. */
const BAND = (930 + 1100) / 2, STICK_X = 118, FIRE_X = 600 - 118;
function press(g, type, x, y, id = 3) {
  g.window.document.getElementById('cv').dispatchEvent(new g.window.PointerEvent(type,
    { clientX: x, clientY: y, pointerType: 'touch', pointerId: id, bubbles: true, cancelable: true }));
}
const stick = (g, type, x) => press(g, type, x, BAND, 1);
const fire = (g, type) => press(g, type, FIRE_X, BAND, 2);

function run(g, frames, t = 1000) {
  for (let i = 0; i < frames; i++) { t += 16.7; g.frame(t); if (g.errors.length) break; }
  return t;
}

test('the shell boots without throwing', async () => {
  const g = await bootAndStart(SHELL);
  assert.deepEqual(g.errors, [], 'boot threw');
  assert.ok(g.world, 'the world exists, so the module ran to completion');
  assert.equal(g.world.running, true, 'Begin started the run');
});

test('the stick moves the gun, further from centre is faster, and moving does not fire', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  const x0 = world.gun.x;
  stick(g, 'pointerdown', STICK_X + 70);           // full right
  let t = run(g, 30);
  const full = world.gun.x - x0;
  assert.ok(full > 0, 'pushed right, the gun went right');
  assert.ok(full <= E.GUN_SPEED * (31 / 60) + 1, 'no faster than the gun\'s top speed');
  assert.equal(world.shot, null, 'and moving alone never fired');
  stick(g, 'pointermove', STICK_X + 30);           // part way
  const x1 = world.gun.x;
  t = run(g, 30, t);
  assert.ok(world.gun.x - x1 > 0 && world.gun.x - x1 < full * 0.75, 'a half push is slower');
  stick(g, 'pointermove', STICK_X - 70);
  const x2 = world.gun.x;
  t = run(g, 10, t);
  assert.ok(world.gun.x < x2, 'and it reverses');
  stick(g, 'pointerup', STICK_X - 70);
  const x3 = world.gun.x;
  run(g, 10, t);
  assert.equal(world.gun.x, x3, 'let go, the gun stops');
  assert.deepEqual(g.errors, []);
});

test('a thumb resting on the stick\'s centre leaves the gun still', async () => {
  const g = await bootAndStart(SHELL);
  const x0 = g.world.gun.x;
  stick(g, 'pointerdown', STICK_X + 4);
  run(g, 30);
  assert.equal(g.world.gun.x, x0);
});

test('the fire button fires, keeps firing while held, and stops when lifted', async () => {
  const g = await bootAndStart(SHELL);
  const { world } = g;
  fire(g, 'pointerdown');
  g.frame(1000);
  assert.ok(world.shot, 'pressing fire fired');
  let shots = 0, t = 1000;
  for (let i = 0; i < 120; i++) { const had = world.shot; t += 16.7; g.frame(t); if (world.shot && world.shot !== had) shots++; }
  assert.ok(shots >= 2, `holding fire keeps firing (${shots} more shots)`);
  fire(g, 'pointerup');
  world.shot = null;
  run(g, 30, t);
  assert.equal(world.shot, null, 'nothing fires once it is lifted');
});

test('both thumbs at once, and lifting one leaves the other working', async () => {
  const g = await bootAndStart(SHELL);
  const { world } = g;
  stick(g, 'pointerdown', STICK_X - 70);
  fire(g, 'pointerdown');
  const x0 = world.gun.x;
  let t = run(g, 20);
  assert.ok(world.gun.x < x0 && world.shot, 'moving and firing together');
  fire(g, 'pointerup');
  const x1 = world.gun.x;
  t = run(g, 10, t);
  assert.ok(world.gun.x < x1, 'lifting fire did not stop the stick');
  fire(g, 'pointerdown');
  stick(g, 'pointerup', STICK_X - 70);
  world.shot = null;
  run(g, 3, t);
  assert.ok(world.shot, 'and lifting the stick did not stop fire');
});

test('a touch on the board above the ground does nothing', async () => {
  const g = await bootAndStart(SHELL);
  const x0 = g.world.gun.x;
  press(g, 'pointerdown', 80, 600, 4);
  press(g, 'pointerdown', 520, 600, 5);
  run(g, 30);
  assert.equal(g.world.gun.x, x0);
  assert.equal(g.world.shot, null);
});

test('a busy board draws: both poses, bombs, the saucer, bitten bunkers, a dead gun', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  fire(g, 'pointerdown'); stick(g, 'pointerdown', STICK_X + 40);
  let t = run(g, 600);                             // shooting, marching, bombs falling
  stick(g, 'pointerup', STICK_X + 40);              // fire stays held: the button draws lit
  world.saucer = { x: 200, dir: 1, pts: 100 };
  world.bombs.push({ x: 100, y: 500 }, { x: 400, y: 700 });
  for (let i = 0; i < 30; i++) E.bite(world, i % 4, (i * 7) % 140, i % 2 === 0);
  t = run(g, 2, t);
  world.formation.pose = 1 - world.formation.pose;
  world.gun.dead = 1;
  run(g, 2, t);
  assert.deepEqual(g.errors, [], 'drawing a busy board threw');
});

test('a deep wave runs and draws for a while without throwing', async () => {
  const g = await bootAndStart(SHELL);
  g.world.wave = 9;
  g.E.resetGame(g.world); g.world.wave = 8; g.world.waveClear = true; g.E.nextWave(g.world);
  g.world.running = true;
  fire(g, 'pointerdown');
  run(g, 900);
  assert.deepEqual(g.errors, [], 'a deep wave threw while drawing');
});

test('a held wave raises its banner, records progress, and Next wave starts the next', async () => {
  const g = await bootAndStart(SHELL);
  const { world } = g;
  const doc = g.window.document;
  world.formation.alive = world.formation.alive.map((_, i) => i === 0);
  world.shot = { x: g.E.invPos(world, 0, 0).x, y: g.E.invPos(world, 0, 0).y + 4 };
  run(g, 3);
  assert.equal(world.waveClear, true, 'shooting the last invader held the wave');
  assert.ok(!doc.getElementById('banner').classList.contains('hide'), 'the banner is up');
  assert.match(doc.getElementById('banner').textContent, /Wave 1 held/);
  assert.equal(g.window.localStorage.getItem('arcade:progress:shield-wall'), '1',
    'and the wave is recorded for the unlock chain');
  doc.getElementById('go').click();
  assert.equal(world.wave, 2);
  assert.equal(world.running, true);
  assert.deepEqual(g.errors, [], 'the wave banner threw');
});

test('the saucer shows what it was worth, unless numbers are switched off', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  world.saucer = { x: 300, dir: 1, points: 150 };
  world.shot = { x: 300, y: E.SAUCER_Y + 20 };
  run(g, 2);
  assert.equal(world.saucer, null, 'setup: the saucer was hit');
  assert.equal(world.score, 150);
  assert.deepEqual(g.errors, [], 'drawing the floater threw');

  const off = await bootAndStart(SHELL, { storage: { 'arcade:prefs': JSON.stringify({ numbers: false }) } });
  off.world.saucer = { x: 300, dir: 1, points: 150 };
  off.world.shot = { x: 300, y: E.SAUCER_Y + 20 };
  run(off, 2);
  assert.equal(off.world.score, 150);
  assert.deepEqual(off.errors, []);
});

test('the wave banner says the next wave starts lower only while it does', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  const doc = g.window.document;
  const clearNow = (t) => {
    world.formation.alive = world.formation.alive.map((_, i) => i === 0);
    const p = E.invPos(world, 0, 0);
    world.shot = { x: p.x, y: p.y + 4 };
    return run(g, 3, t);
  };
  let t = clearNow(1000);
  assert.match(doc.getElementById('hint').textContent, /starts lower/);
  world.wave = E.LOWER_MAX + 1;                    // past the last notch
  doc.getElementById('go').click();
  t = run(g, 2, t);                                // a frame sees the wave running, so the next clear is an edge
  clearNow(t);
  assert.ok(world.waveClear);
  assert.doesNotMatch(doc.getElementById('hint').textContent, /starts lower/);
});

test('losing the last gun ends the run with a banner', async () => {
  const g = await bootAndStart(SHELL);
  const { world } = g;
  world.lives = 1;
  world.bombs.push({ x: world.gun.x, y: world.L.GUN_Y - 4 });
  run(g, 4);
  assert.equal(world.over, true);
  assert.match(g.window.document.getElementById('banner').textContent, /gun is gone/i);
  assert.deepEqual(g.errors, [], 'the game-over banner threw');
});

test('a formation reaching the ground ends the run as a landing', async () => {
  const g = await bootAndStart(SHELL);
  const { world } = g;
  world.formation.y = world.L.FLOOR;               // the march brings them down
  run(g, 120);
  assert.equal(world.over, true);
  assert.match(g.window.document.getElementById('banner').textContent, /landed/i);
});
