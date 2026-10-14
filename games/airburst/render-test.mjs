/* Draw-path smoke test: boots the real shell against a real canvas and pushes
   every visual state through it. The engine suite proves the rules; this proves
   the game can be looked at.

   Needs `npm install --no-save jsdom canvas`.
   Run: node --test games/airburst/render-test.mjs
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { bootAndStart } from '../../tools/render-harness.mjs';

const SHELL = fileURLToPath(new URL('./airburst.html', import.meta.url));

/** A tap on the board at board coordinates (the harness maps them 1:1). */
function tap(g, x, y) {
  const cv = g.window.document.getElementById('cv');
  cv.dispatchEvent(new g.window.PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true, cancelable: true }));
}

test('the shell boots without throwing', async () => {
  const g = await bootAndStart(SHELL);
  assert.deepEqual(g.errors, [], 'boot threw');
  assert.ok(g.world, 'the world exists, so the module ran to completion');
  assert.equal(g.world.running, true, 'Begin started the run');
});

test('a tap in the sky fires, and a tap on the ground does not', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  tap(g, 300, 400);
  assert.equal(world.interceptors.length, 1, 'a tap fired an interceptor');
  assert.equal(E.ammoLeft(world), 3 * E.BASE_AMMO - 1);
  tap(g, 300, world.L.GROUND_Y + 20);
  assert.equal(world.interceptors.length, 1, 'the ground is not a target');
  assert.equal(g.window.document.getElementById('uiAmmo').textContent, String(3 * E.BASE_AMMO - 1),
    'and the HUD shows what is left');
});

test('every object in flight draws: warheads, interceptors, bursts, lost cities and batteries', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  let t = 1000;
  for (let i = 0; i < 240; i++) { t += 16.7; g.frame(t); }     // let warheads in
  tap(g, 150, 300); tap(g, 300, 500); tap(g, 450, 200);
  for (let i = 0; i < 20; i++) { t += 16.7; g.frame(t); }      // some reach and burst
  world.cities[1].alive = false;
  world.bases[2].alive = false; world.bases[2].ammo = 0;
  world.bases[0].ammo = 3;
  g.frame(t + 16.7);
  assert.ok(world.warheads.length > 0, 'warheads are on screen');
  assert.ok(world.interceptors.length + world.blasts.length > 0, 'and our side is too');
  assert.deepEqual(g.errors, [], 'drawing a busy sky threw');
});

test('splitting warheads draw as they split', async () => {
  const g = await bootAndStart(SHELL);
  const { world } = g;
  world.wave = 9;
  world.toSpawn = 12; world.spawnT = 0;
  let t = 1000;
  for (let i = 0; i < 900; i++) { t += 16.7; g.frame(t); if (g.errors.length) break; }
  assert.deepEqual(g.errors, [], 'a deep wave threw while drawing');
});

test('a held wave raises its banner with the bonus, and Next wave starts the next', async () => {
  const g = await bootAndStart(SHELL);
  const { world } = g;
  const doc = g.window.document;
  world.toSpawn = 0; world.warheads = []; world.interceptors = []; world.blasts = [];
  g.frame(2000);
  g.frame(2017);
  assert.equal(world.waveClear, true);
  assert.ok(!doc.getElementById('banner').classList.contains('hide'), 'the banner is up');
  assert.match(doc.getElementById('banner').textContent, /Wave 1 held/);
  assert.match(doc.getElementById('hint').textContent, /\+\d+/, 'with the bonus on it');
  assert.equal(g.window.localStorage.getItem('arcade:progress:airburst'), '1',
    'and the wave is recorded for the unlock chain');
  doc.getElementById('go').click();
  assert.equal(world.wave, 2);
  assert.equal(world.running, true);
  assert.deepEqual(g.errors, [], 'the wave banner threw');
});

test('losing every city ends the run with a banner', async () => {
  const g = await bootAndStart(SHELL);
  const { world } = g;
  world.cities.forEach(c => { c.alive = false; });
  world.over = true; world.running = false;
  g.frame(1000);
  assert.match(g.window.document.getElementById('banner').textContent, /cities are gone/i);
  assert.deepEqual(g.errors, [], 'the game-over banner threw');
});
