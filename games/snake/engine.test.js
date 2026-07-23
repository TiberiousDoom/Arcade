import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.js';

const L = E.LAYOUT;

/** A running world with the food parked somewhere the snake won't blunder into
 *  during a short test. */
function world(opts = {}) {
  const w = E.createWorld(opts);
  w.running = true;
  w.food = { x: L.COLS - 2, y: 1 };
  return w;
}

const headOf = (w) => w.snake[0];
const at = (w, x, y) => w.snake.some(s => s.x === x && s.y === y);

/* ---------- board and setup ---------- */

test('the board dimensions derive from the grid', () => {
  assert.equal(L.W, L.COLS * L.CELL);
  assert.equal(L.H, L.ROWS * L.CELL);
});

test('a new world starts with a horizontal snake heading right', () => {
  const w = E.createWorld();
  assert.equal(w.snake.length, E.START_LEN);
  assert.deepEqual(w.dir, { x: 1, y: 0 });
  const ys = new Set(w.snake.map(s => s.y));
  assert.equal(ys.size, 1, 'all on one row');
  // head is ahead of the tail, so the body trails behind the direction of travel
  assert.ok(w.snake[0].x > w.snake[w.snake.length - 1].x);
});

test('a new world has food on the board, off the snake', () => {
  const w = E.createWorld();
  assert.ok(w.food, 'food exists');
  assert.equal(at(w, w.food.x, w.food.y), false, 'not under the snake');
  assert.ok(E.inBounds(L, w.food.x, w.food.y));
});

/* ---------- determinism ---------- */

test('the same seed produces the same food sequence', () => {
  const a = E.createWorld({ seed: 12345 });
  const b = E.createWorld({ seed: 12345 });
  assert.deepEqual(a.food, b.food);
  for (let i = 0; i < 20; i++) {
    E.spawnFood(a); E.spawnFood(b);
    assert.deepEqual(a.food, b.food, `food ${i} matches`);
  }
});

test('different seeds diverge', () => {
  const a = E.createWorld({ seed: 1 });
  const b = E.createWorld({ seed: 999 });
  const seqA = [], seqB = [];
  for (let i = 0; i < 12; i++) {
    E.spawnFood(a); E.spawnFood(b);
    seqA.push(`${a.food.x},${a.food.y}`); seqB.push(`${b.food.x},${b.food.y}`);
  }
  assert.notDeepEqual(seqA, seqB);
});

/* ---------- movement ---------- */

test('a tick advances the head one cell in the current direction', () => {
  const w = world();
  const before = { ...headOf(w) };
  E.tick(w);
  assert.deepEqual(headOf(w), { x: before.x + 1, y: before.y });
});

test('the snake keeps its length when it has not eaten', () => {
  const w = world();
  const len = w.snake.length;
  for (let i = 0; i < 5; i++) E.tick(w);
  assert.equal(w.snake.length, len);
});

test('the tail follows the head exactly', () => {
  const w = world();
  const secondCell = { ...w.snake[1] };
  E.tick(w);
  // after one tick the old second cell is where the head used to be trailing
  assert.equal(w.snake[2].x, secondCell.x);
  assert.equal(w.snake[2].y, secondCell.y);
});

/* ---------- turning ---------- */

test('turn queues a direction and it applies on the next tick', () => {
  const w = world();
  assert.equal(E.turn(w, 0, -1), true);
  E.tick(w);
  assert.deepEqual(w.dir, { x: 0, y: -1 });
});

test('the snake cannot reverse into its own neck', () => {
  const w = world();                     // heading right
  assert.equal(E.turn(w, -1, 0), false, 'straight reversal refused');
  E.tick(w);
  assert.deepEqual(w.dir, { x: 1, y: 0 }, 'still heading right');
});

test('a duplicate turn is refused rather than eating a queue slot', () => {
  const w = world();
  assert.equal(E.turn(w, 1, 0), false);
  assert.equal(w.queue.length, 0);
});

test('two turns can be buffered inside one tick', () => {
  const w = world();                     // heading right
  assert.equal(E.turn(w, 0, -1), true, 'up');
  assert.equal(E.turn(w, -1, 0), true, 'then left — legal after the up');
  assert.equal(w.queue.length, 2);
  E.tick(w);
  assert.deepEqual(w.dir, { x: 0, y: -1 });
  E.tick(w);
  assert.deepEqual(w.dir, { x: -1, y: 0 });
});

test('the queue is capped', () => {
  const w = world();
  E.turn(w, 0, -1);
  E.turn(w, -1, 0);
  assert.equal(E.turn(w, 0, 1), false, 'third turn refused');
  assert.equal(w.queue.length, E.MAX_QUEUE);
});

test('a buffered turn is validated against the queued direction, not the current one', () => {
  const w = world();                     // heading right
  E.turn(w, 0, -1);                      // now facing up once applied
  // right would be legal off "up", but a second up is a duplicate
  assert.equal(E.turn(w, 0, -1), false);
  assert.equal(E.turn(w, 0, 1), false, 'down would reverse the queued up');
  assert.equal(E.turn(w, 1, 0), true, 'right is a legal follow-up');
});

/* ---------- eating and growth ---------- */

test('eating food scores, grows the snake, and moves the food', () => {
  const w = world();
  const h = headOf(w);
  w.food = { x: h.x + 1, y: h.y };
  const len = w.snake.length, score = w.score;
  E.tick(w);
  assert.equal(w.score, score + E.FOOD_SCORE);
  assert.equal(w.eaten, 1);
  assert.notDeepEqual(w.food, { x: h.x + 1, y: h.y }, 'new food placed elsewhere');
  // growth is spread over the following ticks
  for (let i = 0; i < E.GROW_PER_FOOD; i++) E.tick(w);
  assert.equal(w.snake.length, len + E.GROW_PER_FOOD);
});

test('the snake speeds up as it eats', () => {
  const w = world();
  const slow = E.tickRate(w);
  w.eaten = 20;
  assert.ok(E.tickRate(w) < slow, 'ticks come faster');
});

test('the tick rate bottoms out rather than reaching zero', () => {
  const w = world();
  w.eaten = 100000;
  assert.equal(E.tickRate(w), E.MIN_TICK);
});

/* ---------- bonus ---------- */

test('a bonus appears after the right number of foods', () => {
  const w = world();
  w.eaten = E.BONUS_EVERY - 1;
  const h = headOf(w);
  w.food = { x: h.x + 1, y: h.y };
  E.tick(w);
  assert.ok(w.bonus, 'bonus spawned on the milestone food');
  assert.equal(at(w, w.bonus.x, w.bonus.y), false, 'not under the snake');
});

test('eating a bonus scores and clears it', () => {
  const w = world();
  const h = headOf(w);
  w.bonus = { x: h.x + 1, y: h.y, ttl: 10 };
  const score = w.score;
  E.tick(w);
  assert.equal(w.score, score + E.BONUS_SCORE);
  assert.equal(w.bonus, null);
});

test('a bonus expires on its own timer', () => {
  const w = world();
  w.bonus = { x: 1, y: 1, ttl: 3 };
  for (let i = 0; i < 3; i++) E.tick(w);
  assert.equal(w.bonus, null, 'gone once the ttl runs out');
});

/* ---------- death ---------- */

test('running into a wall ends the run', () => {
  const w = world();
  for (let i = 0; i < L.COLS + 2 && !w.over; i++) E.tick(w);
  assert.equal(w.over, true);
  assert.equal(w.running, false);
});

test('running into yourself ends the run', () => {
  const w = world();
  // grow long enough to reach around, then spiral into the body
  w.snake = [];
  const y = 10;
  for (let i = 0; i < 8; i++) w.snake.push({ x: 10 - i, y });
  w.dir = { x: 1, y: 0 };
  // box back into the body: up, left, down
  E.turn(w, 0, -1); E.tick(w);
  E.turn(w, -1, 0); E.tick(w);
  E.turn(w, 0, 1); E.tick(w);
  E.tick(w);
  assert.equal(w.over, true, 'closed the loop onto its own body');
});

test('following your own tail is not a death', () => {
  // the tail cell empties on the same tick the head arrives, so this is legal
  const w = world();
  w.snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }];
  w.dir = { x: 0, y: 1 };   // head moves down into where the tail is leaving
  w.grow = 0;
  E.tick(w);
  assert.equal(w.over, false, 'chasing the tail survives');
});

test('a mid-growth snake does NOT get the tail exemption', () => {
  const w = world();
  w.snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }];
  w.dir = { x: 0, y: 1 };
  w.grow = 2;               // tail stays put this tick, so that cell is solid
  E.tick(w);
  assert.equal(w.over, true, 'growing into the tail is a real collision');
});

test('a dead snake ignores further ticks and turns', () => {
  const w = world();
  w.over = true;
  const snapshot = JSON.stringify(w.snake);
  E.tick(w);
  assert.equal(JSON.stringify(w.snake), snapshot, 'no movement after death');
  assert.equal(E.turn(w, 0, 1), false, 'no steering after death');
});

/* ---------- the time accumulator ---------- */

test('step runs a tick once enough time has passed', () => {
  const w = world();
  const before = { ...headOf(w) };
  E.step(w, E.tickRate(w) * 0.5);
  assert.deepEqual(headOf(w), before, 'half a tick moves nothing');
  E.step(w, E.tickRate(w) * 0.6);
  assert.notDeepEqual(headOf(w), before, 'crossing the threshold ticks');
});

test('step does not run while paused or after death', () => {
  const w = world();
  w.running = false;
  const before = { ...headOf(w) };
  E.step(w, 10);
  assert.deepEqual(headOf(w), before);
});

test('a huge dt cannot burst into unlimited ticks', () => {
  const w = world();
  w.snake = [{ x: 2, y: 12 }];   // lone cell with room to run
  w.dir = { x: 1, y: 0 };
  E.step(w, 100);                // a tab that regained focus after a minute
  assert.ok(!w.over || w.snake[0].x <= L.COLS, 'stayed sane');
  assert.ok(w.acc < 1, 'the backlog was dropped rather than replayed');
});

test('tickProgress reports the slide between cells', () => {
  const w = world();
  assert.equal(E.tickProgress(w), 0);
  E.step(w, E.tickRate(w) * 0.5);
  assert.ok(E.tickProgress(w) > 0.4 && E.tickProgress(w) < 0.6);
});

/* ---------- win condition ---------- */

test('filling the board wins rather than crashing on nowhere to put food', () => {
  const w = world();
  // A snake covering every cell but one, with the head adjacent to that last
  // free cell and heading into it. Not a contiguous body — this test is only
  // about the "no room left for food" path, which is how a run is actually won.
  const tx = L.COLS - 1, ty = L.ROWS - 1;     // the last free cell
  const hx = L.COLS - 1, hy = L.ROWS - 2;     // the head, right above it
  w.snake = [];
  for (let y = 0; y < L.ROWS; y++) {
    for (let x = 0; x < L.COLS; x++) {
      if (x === tx && y === ty) continue;
      if (x === hx && y === hy) continue;
      w.snake.push({ x, y });
    }
  }
  w.snake.unshift({ x: hx, y: hy });
  w.dir = { x: 0, y: 1 };
  w.grow = 5;                                  // tail stays put, so nothing frees up
  w.food = { x: tx, y: ty };
  assert.equal(E.freeCells(w).length, 0, 'setup: only the food cell is open');
  E.tick(w);
  assert.equal(w.won, true, 'board full is a win');
  assert.equal(w.over, true);
});

test('freeCells excludes the snake, the food, and the bonus', () => {
  const w = world();
  w.bonus = { x: 0, y: 0, ttl: 5 };
  const free = E.freeCells(w);
  const key = c => `${c.x},${c.y}`;
  const freeKeys = new Set(free.map(key));
  for (const s of w.snake) assert.ok(!freeKeys.has(key(s)), 'snake cell not free');
  assert.ok(!freeKeys.has(key(w.food)), 'food cell not free');
  assert.ok(!freeKeys.has('0,0'), 'bonus cell not free');
  assert.equal(free.length, L.COLS * L.ROWS - w.snake.length - 2);
});

/* ---------- reset ---------- */

test('resetGame restores a clean opening position', () => {
  const w = world();
  w.score = 500; w.eaten = 30; w.over = true; w.snake = [{ x: 1, y: 1 }];
  E.resetGame(w);
  assert.equal(w.score, 0);
  assert.equal(w.eaten, 0);
  assert.equal(w.over, false);
  assert.equal(w.snake.length, E.START_LEN);
  assert.ok(w.food);
});

/* ---------- full-run sanity ---------- */

test('a long random-walk run never corrupts the snake', () => {
  const w = world({ seed: 4242 });
  w.food = null; E.spawnFood(w);
  let turns = 0;
  for (let i = 0; i < 3000 && !w.over; i++) {
    // steer pseudo-randomly but deterministically
    if (i % 7 === 0) {
      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      const d = dirs[(i * 13 + turns++) % 4];
      E.turn(w, d[0], d[1]);
    }
    E.tick(w);

    const keys = new Set(w.snake.map(s => `${s.x},${s.y}`));
    assert.equal(keys.size, w.snake.length, `no duplicated cells at tick ${i}`);
    for (const s of w.snake) {
      assert.ok(E.inBounds(L, s.x, s.y), `cell in bounds at tick ${i}`);
    }
    if (w.food) assert.equal(at(w, w.food.x, w.food.y), false, 'food never under the snake');
  }
  assert.ok(true, 'survived the walk with the invariants intact');
});

test('the snake body stays contiguous — every cell adjoins the next', () => {
  const w = world({ seed: 77 });
  for (let i = 0; i < 400 && !w.over; i++) {
    if (i % 11 === 0) E.turn(w, 0, i % 22 === 0 ? -1 : 1);
    if (i % 13 === 0) E.turn(w, i % 26 === 0 ? -1 : 1, 0);
    E.tick(w);
    for (let k = 1; k < w.snake.length; k++) {
      const a = w.snake[k - 1], b = w.snake[k];
      const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      assert.equal(d, 1, `cells ${k - 1}/${k} adjoin at tick ${i}`);
    }
  }
});
