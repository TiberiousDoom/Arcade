/* The resume flow end to end, in a real DOM with a real localStorage.
   Needs `npm install --no-save jsdom canvas`. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { bootAndStart, bootGame, wait } from '../../tools/render-harness.mjs';

const SHELL = fileURLToPath(new URL('./airburst.html', import.meta.url));
const KEY = 'arcade:run:airburst';

const background = (g) => {
  const doc = g.window.document;
  Object.defineProperty(doc, 'hidden', { value: true, configurable: true });
  doc.dispatchEvent(new g.window.Event('visibilitychange', { bubbles: true }));
};

function playAWhile(g, frames = 300) {
  const cv = g.window.document.getElementById('cv');
  let t = 1000;
  for (let i = 0; i < frames; i++) {
    if (i % 40 === 20) {
      cv.dispatchEvent(new g.window.PointerEvent('pointerdown',
        { clientX: 100 + (i % 400), clientY: 350, bubbles: true, cancelable: true }));
    }
    t += 16.7;
    g.frame(t);
  }
}

test('backgrounding writes a save, and a reload brings the run back', async () => {
  const first = await bootAndStart(SHELL);
  playAWhile(first);
  first.world.cities[2].alive = false;
  const before = {
    wave: first.world.wave, score: first.world.score,
    ammo: first.E.ammoLeft(first.world), warheads: first.world.warheads.length,
  };
  assert.ok(before.warheads > 0, 'setup: warheads are falling');

  background(first);
  const stored = first.window.localStorage.getItem(KEY);
  assert.ok(stored, 'a save was written');
  assert.match(JSON.parse(stored).label, /Wave/);

  const second = await bootAndStart(SHELL, { storage: { [KEY]: stored } });
  assert.deepEqual(second.errors, [], 'second boot threw');
  assert.equal(second.world.wave, before.wave);
  assert.equal(second.world.score, before.score);
  assert.equal(second.E.ammoLeft(second.world), before.ammo);
  assert.equal(second.world.warheads.length, before.warheads, 'what was falling is still falling');
  assert.equal(second.world.cities[2].alive, false, 'and a lost city stays lost');
  assert.equal(second.world.running, true, 'Continue resumes it');
});

test('a run saved on a held wave resumes into the next wave', async () => {
  const first = await bootAndStart(SHELL);
  const w = first.world;
  w.toSpawn = 0; w.warheads = []; w.interceptors = []; w.blasts = [];
  first.frame(2000); first.frame(2017);
  assert.equal(w.waveClear, true);
  const stored = first.window.localStorage.getItem(KEY);
  assert.ok(stored, 'holding a wave saved the run');

  const second = await bootAndStart(SHELL, { storage: { [KEY]: stored } });
  assert.equal(second.world.wave, 2, 'Continue went on to wave 2');
  assert.equal(second.world.waveClear, false);
  assert.equal(second.world.running, true);
  assert.deepEqual(second.errors, []);
});

test('a resumed run keeps drawing and stepping without throwing', async () => {
  const first = await bootAndStart(SHELL);
  playAWhile(first, 200);
  background(first);
  const stored = first.window.localStorage.getItem(KEY);
  const second = await bootAndStart(SHELL, { storage: { [KEY]: stored } });
  playAWhile(second, 300);
  assert.deepEqual(second.errors, [], 'a restored run threw while playing on');
});

test('a finished run leaves nothing to resume', async () => {
  const g = await bootAndStart(SHELL);
  playAWhile(g, 60);
  g.world.over = true; g.world.running = false;
  g.frame(99999);
  background(g);
  assert.equal(g.window.localStorage.getItem(KEY), null);
});

test('a save from another build is discarded rather than restored', async () => {
  const stale = JSON.stringify({ build: 'v0-ancient', at: Date.now(), label: 'Wave 9 · 8000',
    snap: { wave: 9, score: 8000 } });
  const g = await bootAndStart(SHELL, { storage: { [KEY]: stale } });
  assert.deepEqual(g.errors, [], 'boot threw on a stale save');
  assert.equal(g.world.wave, 1, 'started fresh');
  assert.equal(g.window.localStorage.getItem(KEY), null, 'and cleared it');
});

test('a corrupt save does not stop the game loading', async () => {
  const g = await bootAndStart(SHELL, { storage: { [KEY]: '{{{' } });
  assert.deepEqual(g.errors, [], 'boot threw on a corrupt save');
  assert.ok(g.world);
});

test('backing out of the resume banner does not destroy the saved run', async () => {
  const first = await bootAndStart(SHELL);
  playAWhile(first);
  background(first);
  const stored = first.window.localStorage.getItem(KEY);
  const second = bootGame(SHELL, { storage: { [KEY]: stored } });
  await wait(300);
  background(second);
  assert.equal(second.window.localStorage.getItem(KEY), stored,
    'the save survived being looked at and walked away from');
});
