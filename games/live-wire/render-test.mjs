/* Draw-path smoke test: boots the real shell against a real canvas and pushes
   every visual state through it. The engine suite proves the *rules*; this
   proves the game can be looked at.

   Needs `npm install --no-save jsdom canvas`.
   Run: node --test games/live-wire/render-test.mjs
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { bootAndStart } from '../../tools/render-harness.mjs';

const SHELL = fileURLToPath(new URL('./live-wire.html', import.meta.url));

test('the shell boots without throwing', async () => {
  const g = await bootAndStart(SHELL);
  assert.deepEqual(g.errors, [], 'boot threw');
  assert.ok(g.world, 'the world exists, so the module ran to completion');
});

test('a long wire, food and the bonus all render', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  // grow the wire well past its starting length so the body-drawing loop and
  // the head/tail interpolation are exercised on a real shape
  world.grow = 40;
  let t = 1000;
  for (let i = 0; i < 200; i++) { t += 16.7; g.frame(t); if (g.errors.length) break; }
  assert.ok(world.wire.length > 4, `wire grew to ${world.wire.length}`);
  assert.deepEqual(g.errors, [], 'drawing a long wire threw');
});

test('the expiring gold bonus renders while it is on the board', async () => {
  const g = await bootAndStart(SHELL);
  const { world } = g;
  // place a bonus directly rather than waiting for one to be earned
  const free = { c: 2, r: 2 };
  world.bonus = { ...free, left: 5 };
  g.frame(1000);
  assert.ok(world.bonus, 'bonus staged');
  assert.deepEqual(g.errors, [], 'drawing the bonus threw');
});

test('a full run to death never throws while drawing', async () => {
  const g = await bootAndStart(SHELL);
  const { world } = g;
  let t = 1000;
  for (let i = 0; i < 1200 && !world.over && !world.won; i++) {
    t += 16.7;
    g.frame(t);
    if (g.errors.length) break;
  }
  assert.deepEqual(g.errors, [], 'a live run threw while drawing');
});

test('the game-over banner renders', async () => {
  const g = await bootAndStart(SHELL);
  g.world.over = true;
  g.frame(1000);
  assert.deepEqual(g.errors, [], 'drawing a finished game threw');
});
