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

function press(g, type, x, y, target) {
  const doc = g.window.document;
  const el = target || doc.getElementById('cv');
  el.dispatchEvent(new g.window.PointerEvent(type,
    { clientX: x, clientY: y, pointerType: 'touch', pointerId: 3, bubbles: true, cancelable: true }));
}

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

test('holding moves the gun to the finger and fires; letting go stops firing', async () => {
  const g = await bootAndStart(SHELL);
  const { world } = g;
  press(g, 'pointerdown', 150, 1000);              // in the band under the ground
  assert.equal(world.gun.x, 150, 'the gun went to the finger');
  g.frame(1000);
  assert.ok(world.shot, 'holding fired');
  press(g, 'pointermove', 420, 1000);
  assert.equal(world.gun.x, 420, 'and follows it');
  press(g, 'pointerup', 420, 1000);
  world.shot = null;
  g.frame(1017);
  assert.equal(world.shot, null, 'nothing fires once the finger is up');
  assert.deepEqual(g.errors, []);
});

test('a busy board draws: both poses, bombs, the saucer, bitten bunkers, a dead gun', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  press(g, 'pointerdown', 300, 1000);
  let t = run(g, 600);                             // shooting, marching, bombs falling
  press(g, 'pointerup', 300, 1000);
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
  press(g, 'pointerdown', 300, 1000);
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
