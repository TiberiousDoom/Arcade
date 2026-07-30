/* The resume flow end to end, in a real DOM with a real localStorage.
   Needs `npm install --no-save jsdom canvas`. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { bootAndStart } from '../../tools/render-harness.mjs';

const SHELL = fileURLToPath(new URL('./angle-iron.html', import.meta.url));
const KEY = 'arcade:run:angle-iron';

const background = (g) => {
  const doc = g.window.document;
  Object.defineProperty(doc, 'hidden', { value: true, configurable: true });
  doc.dispatchEvent(new g.window.Event('visibilitychange', { bubbles: true }));
};

async function playAWhile(g, frames = 240) {
  const { world, E } = g;
  let t = 1000;
  for (let i = 0; i < frames; i++) {
    if (world.held) E.launch(world);
    const ball = world.balls[0];
    if (ball) E.setPaddle(world, ball.x);      // keep it alive so play continues
    t += 16.7;
    g.frame(t);
  }
}

test('backgrounding writes a save, and a reload brings the run back', async () => {
  const first = await bootAndStart(SHELL);
  assert.deepEqual(first.errors, [], 'boot threw');
  await playAWhile(first);
  // stage a powerup and a falling capsule, so the interesting state is covered
  first.E.applyPowerup(first.world, 'wide');
  first.world.drops = [{ kind: 'multi', x: 100, y: 300, vy: first.E.DROP_SPEED }];
  const before = {
    level: first.world.level, score: first.world.score, lives: first.world.lives,
    bricks: first.E.aliveBricks(first.world),
  };
  assert.ok(before.bricks < first.world.bricks.length, 'setup: some bricks are gone');

  background(first);
  const stored = first.window.localStorage.getItem(KEY);
  assert.ok(stored, 'a save was written');
  assert.ok(JSON.parse(stored).label.includes('Level'));

  const second = await bootAndStart(SHELL, { storage: { [KEY]: stored } });
  assert.deepEqual(second.errors, [], 'second boot threw');
  assert.equal(second.world.level, before.level, 'level came back');
  assert.equal(second.world.score, before.score, 'score came back');
  assert.equal(second.world.lives, before.lives, 'lives came back');
  assert.equal(second.E.aliveBricks(second.world), before.bricks, 'brick damage came back');
  assert.ok(second.world.effects.wide > 0, 'the running effect came back');
  assert.equal(second.world.drops.length, 1, 'the falling capsule came back');
});

test('a resumed run keeps drawing and stepping without throwing', async () => {
  const first = await bootAndStart(SHELL);
  await playAWhile(first, 180);
  background(first);
  const stored = first.window.localStorage.getItem(KEY);

  const second = await bootAndStart(SHELL, { storage: { [KEY]: stored } });
  await playAWhile(second, 240);
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
    build: 'v0-ancient', at: Date.now(), label: 'Level 6 · 8000',
    snap: { level: 6, score: 8000, bricks: [], balls: [], drops: [] },
  });
  const g = await bootAndStart(SHELL, { storage: { [KEY]: stale } });
  assert.deepEqual(g.errors, [], 'boot threw on a stale save');
  assert.equal(g.world.level, 1, 'started fresh');
  assert.equal(g.window.localStorage.getItem(KEY), null, 'and cleared it');
});

test('a corrupt save does not stop the game loading', async () => {
  const g = await bootAndStart(SHELL, { storage: { [KEY]: '{{{' } });
  assert.deepEqual(g.errors, [], 'boot threw on a corrupt save');
  assert.ok(g.world, 'the game still came up');
});
