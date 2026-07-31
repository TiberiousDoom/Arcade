/* Draw-path smoke test: boots the real shell against a real canvas and pushes
   every visual state through it. The engine suite proves the *rules*; this
   proves the game can be looked at.

   Needs `npm install --no-save jsdom canvas`.
   Run: node --test games/hull-breach/render-test.mjs
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { bootAndStart } from '../../tools/render-harness.mjs';

const SHELL = fileURLToPath(new URL('./hull-breach.html', import.meta.url));

test('the shell boots without throwing', async () => {
  const g = await bootAndStart(SHELL);
  assert.deepEqual(g.errors, [], 'boot threw');
  assert.ok(g.world, 'the world exists, so the module ran to completion');
});

test('every powerup capsule renders, and so do both timed effects', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  // one capsule of each kind mid-flight, both effect bars running, and a
  // widened paddle — the states added with powerups, all on screen at once
  world.drops = E.POWERUP_KEYS.map((kind, i) => ({
    kind, x: 60 + i * 90, y: 300 + i * 40, vy: E.DROP_SPEED,
  }));
  world.effects = { wide: E.EFFECT_SECONDS * 0.6, slow: E.EFFECT_SECONDS * 0.3 };
  world.paddle.w = world.L.PADDLE_W * E.WIDE_MULT;
  g.frame(1000);
  assert.equal(world.drops.length, E.POWERUP_KEYS.length, 'all four kinds staged');
  assert.deepEqual(g.errors, [], 'drawing capsules and effect bars threw');
});

test('an empty board with no capsules or effects still draws', async () => {
  // the other half of the branch: the effect-bar loop and capsule loop must
  // both cope with nothing to draw
  const g = await bootAndStart(SHELL);
  g.world.drops = [];
  g.world.effects = { wide: 0, slow: 0 };
  g.frame(1000);
  assert.deepEqual(g.errors, [], 'drawing a bare board threw');
});

test('multiball and damaged bricks render', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  E.launch(world);
  E.applyPowerup(world, 'multi');
  E.applyPowerup(world, 'multi');
  // chew the field up so the damage shading and flash paths both run
  world.bricks.forEach((b, i) => {
    if (i % 3 === 0) b.alive = false;
    else if (i % 3 === 1) { b.hp = 1; b.flash = 0.1; }
  });
  g.frame(1000);
  assert.ok(world.balls.length > 1, 'multiball is live');
  assert.deepEqual(g.errors, [], 'drawing a chewed board threw');
});

test('a rally across several levels never throws while drawing', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  E.launch(world);
  let t = 1000;
  for (let i = 0; i < 600; i++) {
    // keep the ball alive by tracking it, so play continues rather than
    // ending on the first miss
    const ball = world.balls[0];
    if (ball) E.setPaddle(world, ball.x);
    if (world.held) E.launch(world);
    if (world.levelClear) E.nextLevel(world);
    t += 16.7;
    g.frame(t);
    if (g.errors.length) break;
  }
  assert.deepEqual(g.errors, [], 'a live rally threw while drawing');
});

test('the game-over banner renders', async () => {
  const g = await bootAndStart(SHELL);
  g.world.lives = 0;
  g.world.over = true;
  g.frame(1000);
  assert.deepEqual(g.errors, [], 'drawing a finished game threw');
});
