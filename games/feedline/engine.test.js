import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.js';

const L = E.LAYOUT;

/** A running world with the food parked somewhere the wire won't blunder into
 *  during a short test. */
function world(opts = {}) {
  const w = E.createWorld(opts);
  w.running = true;
  w.food = { x: L.COLS - 2, y: 1 };
  return w;
}

const headOf = (w) => w.wire[0];
const at = (w, x, y) => w.wire.some(s => s.x === x && s.y === y);

/* ---------- board and setup ---------- */

test('the board dimensions derive from the grid', () => {
  assert.equal(L.W, L.COLS * L.CELL);
  assert.equal(L.H, L.ROWS * L.CELL);
});

test('a new world starts with a horizontal wire heading right', () => {
  const w = E.createWorld();
  assert.equal(w.wire.length, E.START_LEN);
  assert.deepEqual(w.dir, { x: 1, y: 0 });
  const ys = new Set(w.wire.map(s => s.y));
  assert.equal(ys.size, 1, 'all on one row');
  // head is ahead of the tail, so the body trails behind the direction of travel
  assert.ok(w.wire[0].x > w.wire[w.wire.length - 1].x);
});

test('a new world has food on the board, off the wire', () => {
  const w = E.createWorld();
  assert.ok(w.food, 'food exists');
  assert.equal(at(w, w.food.x, w.food.y), false, 'not under the wire');
  assert.ok(E.inBounds(L, w.food.x, w.food.y));
});

/* ---------- portrait layout ---------- */

const TALL = E.LAYOUT_TALL;

test('the portrait grid is taller than wide, at the same cell size', () => {
  assert.ok(TALL.ROWS > TALL.COLS, 'more rows than columns');
  assert.ok(TALL.H > TALL.W);
  assert.equal(TALL.CELL, L.CELL, 'cells stay the same size, so the wire reads the same');
});

test('pace is identical on both grids — the tick rate is per cell', () => {
  // this is why Feedline needs no speed rescaling, unlike Hull Breach
  const a = E.createWorld({ layout: L });
  const b = E.createWorld({ layout: TALL });
  a.eaten = b.eaten = 7;
  assert.equal(E.tickRate(a), E.tickRate(b));
});

test('a world on the portrait grid starts legally inside it', () => {
  const w = E.createWorld({ layout: TALL });
  assert.equal(w.wire.length, E.START_LEN);
  for (const s of w.wire) {
    assert.ok(E.inBounds(TALL, s.x, s.y), `start cell ${s.x},${s.y} is on the board`);
  }
  assert.ok(E.inBounds(TALL, w.food.x, w.food.y), 'food lands on the board');
  assert.equal(w.wire.some(s => s.x === w.food.x && s.y === w.food.y), false);
});

test('food never spawns off the narrower portrait board', () => {
  const w = E.createWorld({ layout: TALL, seed: 31337 });
  for (let i = 0; i < 200; i++) {
    E.spawnFood(w);
    assert.ok(E.inBounds(TALL, w.food.x, w.food.y), `food ${i} in bounds`);
  }
});

test('the portrait board runs a full game without corrupting the wire', () => {
  const w = E.createWorld({ layout: TALL, seed: 99 });
  w.running = true;
  for (let i = 0; i < 800 && !w.over; i++) {
    if (i % 9 === 0) E.turn(w, 0, i % 18 === 0 ? -1 : 1);
    if (i % 11 === 0) E.turn(w, i % 22 === 0 ? -1 : 1, 0);
    E.tick(w);
    for (const s of w.wire) assert.ok(E.inBounds(TALL, s.x, s.y), `in bounds at tick ${i}`);
    const keys = new Set(w.wire.map(s => `${s.x},${s.y}`));
    assert.equal(keys.size, w.wire.length, `no duplicate cells at tick ${i}`);
  }
});

/* ---------- rotating the phone ---------- */

test('the two grids are exact transposes — the invariant rotation rests on', () => {
  assert.equal(TALL.COLS, L.ROWS);
  assert.equal(TALL.ROWS, L.COLS);
  assert.equal(TALL.CELL, L.CELL);
  assert.equal(TALL.COLS * TALL.ROWS, L.COLS * L.ROWS, 'same number of cells either way');
});

/** Lay a straight wire of `n` cells across the middle of the landscape board,
 *  packed against the left wall so the head keeps every spare column ahead of
 *  it — otherwise the wire starts a cell from the wall and dies immediately,
 *  which tests the wall rather than the rotation. */
function withWire(w, n) {
  const y = Math.floor(w.L.ROWS / 2);
  w.wire = [];
  for (let i = 0; i < n; i++) w.wire.push({ x: n - 1 - i, y });
  w.dir = { x: 1, y: 0 };
  w.grow = 0;
  return w;
}

test('relayout is lossless: the wire is transposed, cell for cell', () => {
  const w = withWire(world({ seed: 5 }), 13);
  w.score = 480; w.eaten = 12;
  const before = w.wire.map(c => ({ ...c }));

  E.relayout(w, TALL);

  assert.equal(w.wire.length, before.length, 'no cell lost');
  for (let i = 0; i < before.length; i++) {
    assert.equal(w.wire[i].x, before[i].y, `cell ${i} x came from old y`);
    assert.equal(w.wire[i].y, before[i].x, `cell ${i} y came from old x`);
  }
  assert.equal(w.score, 480);
  assert.equal(w.eaten, 12);
});

test('direction, food and bonus all turn with the board', () => {
  const w = withWire(world({ seed: 7 }), 6);
  w.dir = { x: 1, y: 0 };
  w.food = { x: 20, y: 3 };
  w.bonus = { x: 5, y: 11, ttl: 17 };
  E.relayout(w, TALL);
  assert.deepEqual(w.dir, { x: 0, y: 1 }, 'heading right becomes heading down');
  assert.deepEqual(w.food, { x: 3, y: 20 });
  assert.equal(w.bonus.x, 11); assert.equal(w.bonus.y, 5);
  assert.equal(w.bonus.ttl, 17, 'the bonus keeps its remaining time');
});

test('the transposed wire is still legal and still moving', () => {
  const w = withWire(world({ seed: 11 }), 25);
  E.relayout(w, TALL);

  const keys = new Set(w.wire.map(c => `${c.x},${c.y}`));
  assert.equal(keys.size, w.wire.length, 'no cell used twice');
  for (const c of w.wire) assert.ok(E.inBounds(TALL, c.x, c.y), `${c.x},${c.y} on the board`);
  for (let i = 1; i < w.wire.length; i++) {
    const a = w.wire[i - 1], b = w.wire[i];
    assert.equal(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1, `cells ${i - 1}/${i} adjoin`);
  }
  w.running = true;
  for (let i = 0; i < 5; i++) E.tick(w);
  assert.equal(w.over, false, 'survives the first ticks after turning');
});

test('turning out and back returns the exact original board', () => {
  const w = withWire(world({ seed: 3 }), 20);
  w.food = { x: 9, y: 4 };
  const before = JSON.stringify({ wire: w.wire, dir: w.dir, food: w.food });
  E.relayout(w, TALL);
  E.relayout(w, L);
  assert.equal(JSON.stringify({ wire: w.wire, dir: w.dir, food: w.food }), before);
  assert.equal(w.L.COLS, L.COLS);
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

test('the wire keeps its length when it has not eaten', () => {
  const w = world();
  const len = w.wire.length;
  for (let i = 0; i < 5; i++) E.tick(w);
  assert.equal(w.wire.length, len);
});

test('the tail follows the head exactly', () => {
  const w = world();
  const secondCell = { ...w.wire[1] };
  E.tick(w);
  // after one tick the old second cell is where the head used to be trailing
  assert.equal(w.wire[2].x, secondCell.x);
  assert.equal(w.wire[2].y, secondCell.y);
});

/* ---------- turning ---------- */

test('turn queues a direction and it applies on the next tick', () => {
  const w = world();
  assert.equal(E.turn(w, 0, -1), true);
  E.tick(w);
  assert.deepEqual(w.dir, { x: 0, y: -1 });
});

test('the wire cannot reverse into its own neck', () => {
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

test('eating food scores, grows the wire, and moves the food', () => {
  const w = world();
  const h = headOf(w);
  w.food = { x: h.x + 1, y: h.y };
  const len = w.wire.length, score = w.score;
  E.tick(w);
  assert.equal(w.score, score + E.FOOD_SCORE);
  assert.equal(w.eaten, 1);
  assert.notDeepEqual(w.food, { x: h.x + 1, y: h.y }, 'new food placed elsewhere');
  // growth is spread over the following ticks
  for (let i = 0; i < E.GROW_PER_FOOD; i++) E.tick(w);
  assert.equal(w.wire.length, len + E.GROW_PER_FOOD);
});

test('the wire speeds up as it eats', () => {
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
  assert.equal(at(w, w.bonus.x, w.bonus.y), false, 'not under the wire');
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
  w.wire = [];
  const y = 10;
  for (let i = 0; i < 8; i++) w.wire.push({ x: 10 - i, y });
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
  w.wire = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }];
  w.dir = { x: 0, y: 1 };   // head moves down into where the tail is leaving
  w.grow = 0;
  E.tick(w);
  assert.equal(w.over, false, 'chasing the tail survives');
});

test('a mid-growth wire does NOT get the tail exemption', () => {
  const w = world();
  w.wire = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }];
  w.dir = { x: 0, y: 1 };
  w.grow = 2;               // tail stays put this tick, so that cell is solid
  E.tick(w);
  assert.equal(w.over, true, 'growing into the tail is a real collision');
});

test('a dead wire ignores further ticks and turns', () => {
  const w = world();
  w.over = true;
  const snapshot = JSON.stringify(w.wire);
  E.tick(w);
  assert.equal(JSON.stringify(w.wire), snapshot, 'no movement after death');
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
  w.wire = [{ x: 2, y: 12 }];   // lone cell with room to run
  w.dir = { x: 1, y: 0 };
  E.step(w, 100);                // a tab that regained focus after a minute
  assert.ok(!w.over || w.wire[0].x <= L.COLS, 'stayed sane');
  assert.ok(w.acc < 1, 'the backlog was dropped rather than replayed');
});

test('tickProgress reports the slide between cells', () => {
  const w = world();
  assert.equal(E.tickProgress(w), 0);
  E.step(w, E.tickRate(w) * 0.5);
  assert.ok(E.tickProgress(w) > 0.4 && E.tickProgress(w) < 0.6);
});

/* ---------- checkpoints ---------- */

test('the board takes the number of meals it takes — the win, in one number', () => {
  /* The calculation the checkpoints exist because of. 576 cells, a wire that
     starts at 4 and grows 2 a meal, so 286 meals fills it. Pinned so a change
     to the grid or the growth rate shows up here rather than being discovered
     by a player four minutes into a run. */
  const L = E.LAYOUT;
  assert.equal(L.COLS * L.ROWS, 576);
  assert.equal(E.mealsToWin(L), 286);
  assert.equal(E.mealsToWin(E.LAYOUT_TALL), E.mealsToWin(L), 'both boards are the same job');
  assert.equal(E.lengthAt(E.mealsToWin(L)), 576, 'and 286 meals is exactly a full board');
});

test('most of a winning run is spent at the speed floor', () => {
  // why one mistake costs so much: the tick rate bottoms out early and the
  // remaining ~80% of the run is played at full pace with a very long wire
  const atFloor = Math.ceil((E.START_TICK - E.MIN_TICK) / E.TICK_STEP);
  assert.ok(atFloor < E.mealsToWin(E.LAYOUT) * 0.3,
    `speed floor should arrive early, hit at meal ${atFloor}`);
});

test('the first checkpoint arrives early enough to actually be met', () => {
  /* The whole reason the ladder changed. At 25% of the board the first bank was
     70 meals away — further than most runs get — so it shipped, worked, and was
     reported as missing. */
  const L = E.LAYOUT;
  const first = Math.ceil((E.CHECKPOINTS[0] * L.COLS * L.ROWS - E.START_LEN) / E.GROW_PER_FOOD);
  assert.ok(first <= 20, `the first bank should be inside the opening minute, is ${first} meals`);
  assert.ok(E.CHECKPOINTS.length >= 6, 'and there should be several to chase');
  // strictly increasing, and none of them at or past a full board
  for (let i = 1; i < E.CHECKPOINTS.length; i++) {
    assert.ok(E.CHECKPOINTS[i] > E.CHECKPOINTS[i - 1], `checkpoint ${i} moves forward`);
  }
  assert.ok(E.CHECKPOINTS[E.CHECKPOINTS.length - 1] < 1, 'the last one is not the win itself');
});

test('checkpoints land where the ladder says and only move forward', () => {
  const w = E.createWorld();
  assert.equal(w.checkpoint, -1, 'nothing banked yet');
  const cells = w.L.COLS * w.L.ROWS;
  for (const [i, frac] of E.CHECKPOINTS.entries()) {
    w.eaten = Math.ceil((frac * cells - E.START_LEN) / E.GROW_PER_FOOD);
    assert.equal(E.checkpointReached(w), i, `${(frac * 100).toFixed(0)}% is checkpoint ${i}`);
  }
  // one meal short of the first is still nothing
  w.eaten = Math.ceil((E.CHECKPOINTS[0] * cells - E.START_LEN) / E.GROW_PER_FOOD) - 1;
  assert.equal(E.checkpointReached(w), -1);
});

test('crossing a checkpoint raises an edge exactly once', () => {
  const w = E.createWorld();
  w.running = true;
  const cells = w.L.COLS * w.L.ROWS;
  const need = Math.ceil((E.CHECKPOINTS[0] * cells - E.START_LEN) / E.GROW_PER_FOOD);
  /* One meal short, then eat it — driving 70 meals by hand would just be
     testing that a straight line hits a wall. `checkpointReached` reads
     `eaten`, so the count is what matters, not how it got there. */
  w.eaten = need - 1;
  assert.equal(E.checkpointReached(w), -1, 'fixture really is one short');
  w.food = { x: w.wire[0].x + w.dir.x, y: w.wire[0].y + w.dir.y };
  assert.ok(E.inBounds(w.L, w.food.x, w.food.y), 'and there is room to take it');
  E.tick(w);

  assert.equal(w.eaten, need);
  assert.equal(w.checkpoint, 0);
  assert.equal(w.justCheckpoint, true, 'the shell gets an edge');
  w.justCheckpoint = false;
  E.tick(w);
  assert.equal(w.justCheckpoint, false, 'and not again on the next tick');
});

test('a resumed checkpoint is a legal board, not a knot', () => {
  const w = E.createWorld();
  assert.equal(E.resumeFromCheckpoint(w, null), false, 'nothing banked, nothing to resume');
  assert.equal(E.resumeFromCheckpoint(w, { eaten: 0 }), false);

  assert.equal(E.resumeFromCheckpoint(w, { eaten: 143, score: 900 }), true);
  assert.equal(w.eaten, 143, 'the speed comes back with the length');
  assert.equal(w.score, 900);
  assert.equal(w.wire.length, E.lengthAt(143));

  const seen = new Set(w.wire.map(c => c.x + ',' + c.y));
  assert.equal(seen.size, w.wire.length, 'no cell used twice');
  assert.ok(w.wire.every(c => E.inBounds(w.L, c.x, c.y)), 'all on the board');
  for (let i = 1; i < w.wire.length; i++) {
    const a = w.wire[i - 1], b = w.wire[i];
    assert.equal(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1, `body contiguous at ${i}`);
  }
  assert.ok(w.food, 'and there is something to eat');
});

/** Unsteered ticks a resumed wire must survive, and cells of clear run it must
 *  be given. Five, because the deepest checkpoint leaves only six on the
 *  portrait board — the board is 80% full by then. */
const RESUME_RUN = 5;

test('every checkpoint resumes into a legal, survivable board on both grids', () => {
  /* The serpentine ends flush against a wall whenever the length is a whole
     number of rows — 144 cells on the 18-wide portrait board is exactly eight —
     and the head then faces straight off the edge. Continuing "the way the fold
     was running" killed it on the first tick. Every checkpoint on every layout,
     because that is the shape of the bug: it depends on length vs row width. */
  for (const layout of [E.LAYOUT, E.LAYOUT_TALL]) {
    const cells = layout.COLS * layout.ROWS;
    for (const frac of E.CHECKPOINTS) {
      const eaten = Math.ceil((frac * cells - E.START_LEN) / E.GROW_PER_FOOD);
      const w = E.createWorld({ layout });
      assert.equal(E.resumeFromCheckpoint(w, { eaten, score: 0 }), true);
      const where = `${layout.COLS}x${layout.ROWS} at ${frac * 100}%`;

      const head = w.wire[0];
      const nx = head.x + w.dir.x, ny = head.y + w.dir.y;
      assert.ok(E.inBounds(w.L, nx, ny), `${where}: heading stays on the board`);
      assert.ok(!w.wire.some(c => c.x === nx && c.y === ny), `${where}: and not into itself`);

      /* The head must be pointed somewhere with room, not merely somewhere
         legal. A 30-cell wire lies along one row, so "carry on the way the fold
         was running" can be legal for two ticks and then a wall — which is why
         the direction is chosen by run length. Five is the bar because the
         deepest checkpoint genuinely has only six: at 80% of a full board there
         is not much anywhere, and past that it is the player's job to steer. */
      const body = new Set(w.wire.map(c => c.x + ',' + c.y));
      let run = 0;
      for (let x = head.x, y = head.y;;) {
        x += w.dir.x; y += w.dir.y;
        if (!E.inBounds(w.L, x, y) || body.has(x + ',' + y)) break;
        run++;
      }
      assert.ok(run >= RESUME_RUN, `${where}: only ${run} cells of room ahead`);

      w.running = true;
      for (let i = 0; i < RESUME_RUN && !w.over; i++) E.tick(w);
      assert.equal(w.over, false, `${where}: survives the ticks it is given`);
    }
  }
});

test('resuming clears the flags a finished run left behind', () => {
  const w = E.createWorld();
  w.over = true; w.won = true; w.running = false;
  E.resumeFromCheckpoint(w, { eaten: 70, score: 100 });
  assert.equal(w.over, false);
  assert.equal(w.won, false);
});

/* ---------- win condition ---------- */

test('filling the board wins rather than crashing on nowhere to put food', () => {
  const w = world();
  // A wire covering every cell but one, with the head adjacent to that last
  // free cell and heading into it. Not a contiguous body — this test is only
  // about the "no room left for food" path, which is how a run is actually won.
  const tx = L.COLS - 1, ty = L.ROWS - 1;     // the last free cell
  const hx = L.COLS - 1, hy = L.ROWS - 2;     // the head, right above it
  w.wire = [];
  for (let y = 0; y < L.ROWS; y++) {
    for (let x = 0; x < L.COLS; x++) {
      if (x === tx && y === ty) continue;
      if (x === hx && y === hy) continue;
      w.wire.push({ x, y });
    }
  }
  w.wire.unshift({ x: hx, y: hy });
  w.dir = { x: 0, y: 1 };
  w.grow = 5;                                  // tail stays put, so nothing frees up
  w.food = { x: tx, y: ty };
  assert.equal(E.freeCells(w).length, 0, 'setup: only the food cell is open');
  E.tick(w);
  assert.equal(w.won, true, 'board full is a win');
  assert.equal(w.over, true);
});

test('freeCells excludes the wire, the food, and the bonus', () => {
  const w = world();
  w.bonus = { x: 0, y: 0, ttl: 5 };
  const free = E.freeCells(w);
  const key = c => `${c.x},${c.y}`;
  const freeKeys = new Set(free.map(key));
  for (const s of w.wire) assert.ok(!freeKeys.has(key(s)), 'wire cell not free');
  assert.ok(!freeKeys.has(key(w.food)), 'food cell not free');
  assert.ok(!freeKeys.has('0,0'), 'bonus cell not free');
  assert.equal(free.length, L.COLS * L.ROWS - w.wire.length - 2);
});

/* ---------- reset ---------- */

test('resetGame restores a clean opening position', () => {
  const w = world();
  w.score = 500; w.eaten = 30; w.over = true; w.wire = [{ x: 1, y: 1 }];
  E.resetGame(w);
  assert.equal(w.score, 0);
  assert.equal(w.eaten, 0);
  assert.equal(w.over, false);
  assert.equal(w.wire.length, E.START_LEN);
  assert.ok(w.food);
});

/* ---------- full-run sanity ---------- */

test('a long random-walk run never corrupts the wire', () => {
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

    const keys = new Set(w.wire.map(s => `${s.x},${s.y}`));
    assert.equal(keys.size, w.wire.length, `no duplicated cells at tick ${i}`);
    for (const s of w.wire) {
      assert.ok(E.inBounds(L, s.x, s.y), `cell in bounds at tick ${i}`);
    }
    if (w.food) assert.equal(at(w, w.food.x, w.food.y), false, 'food never under the wire');
  }
  assert.ok(true, 'survived the walk with the invariants intact');
});

test('the wire body stays contiguous — every cell adjoins the next', () => {
  const w = world({ seed: 77 });
  for (let i = 0; i < 400 && !w.over; i++) {
    if (i % 11 === 0) E.turn(w, 0, i % 22 === 0 ? -1 : 1);
    if (i % 13 === 0) E.turn(w, i % 26 === 0 ? -1 : 1, 0);
    E.tick(w);
    for (let k = 1; k < w.wire.length; k++) {
      const a = w.wire[k - 1], b = w.wire[k];
      const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      assert.equal(d, 1, `cells ${k - 1}/${k} adjoin at tick ${i}`);
    }
  }
});
