/* The resume flow end to end, in a real DOM with a real localStorage.
   Needs `npm install --no-save jsdom canvas`. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { bootAndStart } from '../../tools/render-harness.mjs';

const SHELL = fileURLToPath(new URL('./serpent-battery.html', import.meta.url));
const KEY = 'arcade:run:serpent-battery';

const background = (g) => {
  const doc = g.window.document;
  Object.defineProperty(doc, 'hidden', { value: true, configurable: true });
  doc.dispatchEvent(new g.window.Event('visibilitychange', { bubbles: true }));
};

async function playAWhile(g, frames = 300) {
  let t = 1000;
  for (let i = 0; i < frames; i++) { t += 16.7; g.frame(t); }
}

test('backgrounding writes a save, and a reload brings the run back', async () => {
  const first = await bootAndStart(SHELL);
  assert.deepEqual(first.errors, [], 'boot threw');
  await playAWhile(first);
  first.world.scrap = 40;
  const before = {
    wave: first.world.wave, score: first.world.score,
    lives: first.world.lives, scrap: first.world.scrap,
    segs: first.world.chains.reduce((n, ch) => n + ch.segs.length, 0),
  };

  background(first);
  const stored = first.window.localStorage.getItem(KEY);
  assert.ok(stored, 'a save was written');
  assert.ok(JSON.parse(stored).label.includes('Wave'));

  const second = await bootAndStart(SHELL, { storage: { [KEY]: stored } });
  assert.deepEqual(second.errors, [], 'second boot threw');
  assert.equal(second.world.wave, before.wave, 'wave came back');
  assert.equal(second.world.score, before.score, 'score came back');
  assert.equal(second.world.lives, before.lives, 'lives came back');
  assert.equal(second.world.scrap, before.scrap, 'scrap came back');
  assert.equal(second.world.chains.reduce((n, ch) => n + ch.segs.length, 0), before.segs,
    'the serpent came back at the length it was');
  assert.equal(second.world.cannon, second.world.battery, 'the cannon alias survived');
});

test('a resumed run keeps drawing and stepping without throwing', async () => {
  const first = await bootAndStart(SHELL);
  await playAWhile(first, 200);
  background(first);
  const stored = first.window.localStorage.getItem(KEY);

  const second = await bootAndStart(SHELL, { storage: { [KEY]: stored } });
  await playAWhile(second, 300);
  assert.deepEqual(second.errors, [], 'a restored run threw while playing on');
});

test('a finished run leaves nothing to resume', async () => {
  const g = await bootAndStart(SHELL);
  await playAWhile(g, 60);
  g.world.lives = 0;
  g.world.over = true;
  g.frame(99999);
  background(g);
  assert.equal(g.window.localStorage.getItem(KEY), null);
});

test('a save from another build is discarded rather than restored', async () => {
  const stale = JSON.stringify({
    build: 'v0-ancient', at: Date.now(), label: 'Wave 12 · 9000',
    snap: { wave: 12, score: 9000, chains: [], battery: { guns: [] } },
  });
  const g = await bootAndStart(SHELL, { storage: { [KEY]: stale } });
  assert.deepEqual(g.errors, [], 'boot threw on a stale save');
  assert.equal(g.world.score, 0, 'started fresh');
  assert.equal(g.window.localStorage.getItem(KEY), null, 'and cleared it');
});

test('a corrupt save does not stop the game loading', async () => {
  const g = await bootAndStart(SHELL, { storage: { [KEY]: 'not json at all' } });
  assert.deepEqual(g.errors, [], 'boot threw on a corrupt save');
  assert.ok(g.world, 'the game still came up');
});
