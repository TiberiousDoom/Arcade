/* The resume flow end to end, in a real DOM with a real localStorage.
   Needs `npm install --no-save jsdom canvas`. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { bootAndStart, bootGame, wait } from '../../tools/render-harness.mjs';

const SHELL = fileURLToPath(new URL('./shield-wall.html', import.meta.url));
const KEY = 'arcade:run:shield-wall';

const background = (g) => {
  const doc = g.window.document;
  Object.defineProperty(doc, 'hidden', { value: true, configurable: true });
  doc.dispatchEvent(new g.window.Event('visibilitychange', { bubbles: true }));
};

function playAWhile(g, frames = 300) {
  // the thumb band: the stick bottom left (centre x 118), fire bottom right
  const cv = g.window.document.getElementById('cv');
  const send = (type, x, id) => cv.dispatchEvent(new g.window.PointerEvent(type,
    { clientX: x, clientY: 1015, pointerType: 'touch', pointerId: id, bubbles: true, cancelable: true }));
  send('pointerdown', 482, 2);                     // hold fire
  send('pointerdown', 118, 1);
  let t = 1000;
  for (let i = 0; i < frames; i++) {
    if (i % 40 === 0) send('pointermove', 118 + (i % 80 < 40 ? 60 : -60), 1);   // sweep left and right
    t += 16.7;
    g.frame(t);
  }
  send('pointerup', 118, 1);
  send('pointerup', 482, 2);
}

test('backgrounding writes a save, and a reload brings the run back', async () => {
  const first = await bootAndStart(SHELL);
  playAWhile(first);
  const w = first.world;
  const before = {
    wave: w.wave, score: w.score, lives: w.lives,
    alive: first.E.aliveCount(w), cells: [0, 1, 2, 3].map(b => first.E.bunkerCells(w, b)),
  };
  assert.ok(before.score > 0, 'setup: something was shot');

  background(first);
  const stored = first.window.localStorage.getItem(KEY);
  assert.ok(stored, 'a save was written');
  assert.match(JSON.parse(stored).label, /Wave/);

  const second = await bootAndStart(SHELL, { storage: { [KEY]: stored } });
  const v = second.world;
  assert.deepEqual(second.errors, [], 'second boot threw');
  assert.equal(v.wave, before.wave);
  assert.equal(v.score, before.score);
  assert.equal(v.lives, before.lives);
  assert.equal(second.E.aliveCount(v), before.alive, 'the same invaders are left');
  assert.deepEqual([0, 1, 2, 3].map(b => second.E.bunkerCells(v, b)), before.cells,
    'and the bunkers carry the same damage');
  assert.equal(v.running, true, 'Continue resumes it');
});

test('a run saved on a held wave resumes into the next wave', async () => {
  const first = await bootAndStart(SHELL);
  const w = first.world;
  w.formation.alive = w.formation.alive.map((_, i) => i === 0);
  const p = first.E.invPos(w, 0, 0);
  w.shot = { x: p.x, y: p.y + 4 };
  first.frame(2000); first.frame(2017);
  assert.equal(w.waveClear, true);
  const stored = first.window.localStorage.getItem(KEY);
  assert.ok(stored, 'holding a wave saved the run');

  const second = await bootAndStart(SHELL, { storage: { [KEY]: stored } });
  assert.equal(second.world.wave, 2, 'Continue went on to wave 2');
  assert.equal(second.world.waveClear, false);
  assert.equal(second.world.running, true);
  assert.equal(second.E.aliveCount(second.world), 40, 'with a full formation');
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
