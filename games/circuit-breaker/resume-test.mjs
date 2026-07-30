/* The resume flow end to end, in a real DOM with a real localStorage: play a
   bit, background the app, reload, and check the run comes back.

   The engine suite covers snapshot/hydrate as pure functions. This covers the
   part that can only go wrong in the shell — that the save is actually written
   on the right beat, that the banner offers it, and that pressing Continue
   restores rather than starting fresh.

   Needs `npm install --no-save jsdom canvas`.
   Run: node --test games/circuit-breaker/resume-test.mjs
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { bootAndStart, wait } from '../../tools/render-harness.mjs';

const SHELL = fileURLToPath(new URL('./circuit-breaker.html', import.meta.url));

/** Play far enough in that there is something worth saving. */
async function playAWhile(g, frames = 260) {
  const { world, E } = g;
  world.charge = 99999;
  let built = 0;
  outer:
  for (let r = 0; r < world.L.ROWS; r++)
    for (let c = 0; c < world.L.COLS; c++) {
      if (E.buildTower(world, c, r, E.TOWER_KEYS[built % 3])) built++;
      if (built >= 8) break outer;
    }
  let t = 1000;
  for (let i = 0; i < frames; i++) {
    if (world.betweenWaves && !world.over) E.startWave(world);
    t += 16.7;
    g.frame(t);
  }
  return built;
}

test('backgrounding the app writes a save, and it survives a reload', async () => {
  const first = await bootAndStart(SHELL);
  assert.deepEqual(first.errors, [], 'boot threw');
  await playAWhile(first);
  const before = {
    wave: first.world.wave, score: first.world.score,
    integrity: first.world.integrity, towers: first.world.towers.length,
  };
  assert.ok(before.wave > 0, 'setup: a wave is under way');

  // background the app, the way a phone does
  const doc = first.window.document;
  Object.defineProperty(doc, 'hidden', { value: true, configurable: true });
  doc.dispatchEvent(new first.window.Event('visibilitychange', { bubbles: true }));

  const stored = first.window.localStorage.getItem('arcade:run:circuit-breaker');
  assert.ok(stored, 'a save was written');
  const parsed = JSON.parse(stored);
  assert.ok(parsed.label.includes('Wave'), `label reads "${parsed.label}"`);

  // a fresh boot with that storage carried over is what a reload looks like
  const second = await bootAndStart(SHELL, { storage: { 'arcade:run:circuit-breaker': stored } });
  assert.deepEqual(second.errors, [], 'second boot threw');
  assert.equal(second.world.wave, before.wave, 'wave came back');
  assert.equal(second.world.score, before.score, 'score came back');
  assert.equal(second.world.integrity, before.integrity, 'integrity came back');
  assert.equal(second.world.towers.length, before.towers, 'towers came back');
});

test('a finished run leaves nothing to resume', async () => {
  const g = await bootAndStart(SHELL);
  await playAWhile(g, 60);
  g.world.integrity = 0;
  g.world.over = true;
  g.frame(99999);
  const doc = g.window.document;
  Object.defineProperty(doc, 'hidden', { value: true, configurable: true });
  doc.dispatchEvent(new g.window.Event('visibilitychange', { bubbles: true }));
  assert.equal(g.window.localStorage.getItem('arcade:run:circuit-breaker'), null,
    'a game over is not something to come back to');
});

test('a save from another build is discarded rather than restored', async () => {
  const stale = JSON.stringify({
    build: 'v0-ancient', at: Date.now(), label: 'Wave 9 · 5000',
    snap: { routeIndex: 0, towers: [], enemies: [], wave: 9, score: 5000 },
  });
  const g = await bootAndStart(SHELL, { storage: { 'arcade:run:circuit-breaker': stale } });
  assert.deepEqual(g.errors, [], 'boot threw on a stale save');
  assert.equal(g.world.wave, 0, 'started fresh instead of restoring across builds');
  assert.equal(g.window.localStorage.getItem('arcade:run:circuit-breaker'), null, 'and cleared it');
});

test('a corrupt save does not stop the game loading', async () => {
  const g = await bootAndStart(SHELL, { storage: { 'arcade:run:circuit-breaker': '{ not json' } });
  assert.deepEqual(g.errors, [], 'boot threw on a corrupt save');
  assert.ok(g.world, 'the game still came up');
  assert.equal(g.world.wave, 0, 'as a fresh run');
});
