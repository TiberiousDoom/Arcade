/* Draw-path smoke test: boots the real shell against a real canvas and pushes
   every visual state through it. The engine suite proves the *rules*; this
   proves the game can be looked at.

   Boots `flak-battery.html` directly via the shared harness, which inlines the
   import graph in memory — the same way the other three games' render tests
   work. This used to boot a checked-in `flak-battery-standalone.html`, an early
   single-file distribution experiment that has since been retired; a generated
   artifact that had to be regenerated after every change was a standing trap
   (a stale one meant this test was silently checking old code).

   Needs `npm install --no-save jsdom canvas`.
   Run: node --test games/flak-battery/render-test.mjs
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { bootAndStart } from '../../tools/render-harness.mjs';

// fileURLToPath, not .pathname — on Windows the latter yields a leading slash
// and percent-encoded spaces, which fs rejects.
const SHELL = fileURLToPath(new URL('./flak-battery.html', import.meta.url));

test('the shell boots without throwing', async () => {
  const g = await bootAndStart(SHELL);
  assert.deepEqual(g.errors, [], 'boot threw');
  assert.ok(g.world, 'the world exists, so the module ran to completion');
});

test('every segment type renders on a real canvas without throwing', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  // late enough that every kind is unlocked. Was hardcoded to 6, which after
  // KIND_UNLOCK landed exactly on the >= 6 threshold by luck — one more unlock
  // moving and it would have started failing for no real reason.
  world.wave = Math.max(...Object.values(E.KIND_UNLOCK));
  E.spawnWave(world);
  world.chains[0].s = 1400;
  const kinds = new Set(world.chains[0].segs.map(s => s.kind));
  g.frame(1000);
  const expected = Object.keys(E.KIND_UNLOCK).length + 1;   // + the head
  assert.equal(kinds.size, expected, `expected every segment type, got ${[...kinds]}`);
  assert.deepEqual(g.errors, [], 'render threw');
});

test('the full battery with gun types renders without throwing', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  world.battery.guns.push(E.makeGun(world.L.W * 0.32));
  world.battery.guns.push(E.makeGun(world.L.W * 0.68));
  world.gunUnlocks.rail = true;
  world.gunUnlocks.ion = true;
  E.setGunType(world, 1, 'rail');
  E.setGunType(world, 2, 'ion');
  world.battery.guns[0].heat = 0.7;
  E.spawnPickup(world, 440, 380, 'spread');
  world.shake = 0.5;
  g.frame(1000);
  assert.deepEqual(g.errors, [], 'render threw with guns, pickup, shake');
});
