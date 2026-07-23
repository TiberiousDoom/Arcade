import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.js';

const L = E.LAYOUT;

/** A world with an empty brick field, so ball physics can be tested without
 *  bricks getting in the way. */
function emptyWorld(over = {}) {
  const w = E.createWorld(over);
  w.bricks = [];
  w.running = true;
  w.held = false;     // balls are placed directly, so nothing is racked
  return w;
}

/* ---------- brick field geometry ---------- */

test('brick width fills the field flush with the margins', () => {
  const bw = E.brickWidth();
  const total = L.BRICK_COLS * bw + (L.BRICK_COLS - 1) * L.BRICK_GAP;
  assert.ok(Math.abs(total - (L.W - 2 * L.MARGIN)) < 1e-6, 'columns plus gaps span the field');
});

test('level 1 is a solid wall of the full grid', () => {
  const bricks = E.buildBricks(1);
  assert.equal(bricks.length, L.BRICK_ROWS * L.BRICK_COLS);
  assert.ok(bricks.every(b => b.alive));
});

test('bricks are armoured toward the back rows', () => {
  assert.equal(E.brickHp(L.BRICK_ROWS - 1), 1, 'front row takes one hit');
  assert.equal(E.brickHp(0), 3, 'back row takes three');
  for (let r = 1; r < L.BRICK_ROWS; r++) {
    assert.ok(E.brickHp(r - 1) >= E.brickHp(r), 'hp never rises toward the front');
  }
});

test('brick score scales with armour', () => {
  assert.ok(E.brickScore(3) > E.brickScore(1));
});

test('later level patterns are non-trivial subsets and stay deterministic', () => {
  for (let lvl = 2; lvl <= 4; lvl++) {
    const a = E.buildBricks(lvl);
    const b = E.buildBricks(lvl);
    assert.equal(a.length, b.length, `level ${lvl} builds identically each time`);
    assert.ok(a.length > 0 && a.length < L.BRICK_ROWS * L.BRICK_COLS,
      `level ${lvl} carves a shape (${a.length} bricks)`);
  }
});

test('every brick sits inside the playfield', () => {
  for (let lvl = 1; lvl <= 4; lvl++) {
    for (const b of E.buildBricks(lvl)) {
      assert.ok(b.x >= L.MARGIN - 1e-6 && b.x + b.w <= L.W - L.MARGIN + 1e-6, 'within horizontal margins');
      assert.ok(b.y >= L.BRICK_TOP, 'below the top offset');
    }
  }
});

/* ---------- collision primitives ---------- */

test('circleRect detects overlap and clears a gap', () => {
  assert.equal(E.circleRect(50, 50, 10, 40, 40, 20, 20), true, 'centre inside');
  assert.equal(E.circleRect(5, 5, 3, 40, 40, 20, 20), false, 'far away');
  assert.equal(E.circleRect(38, 50, 3, 40, 40, 20, 20), true, 'just grazing the left face');
});

test('rectHit picks the face the ball is least deep through', () => {
  const ball = { x: 50, y: 39, r: 5, vx: 0, vy: 40 };  // approaching from above
  const hit = E.rectHit(ball, 40, 40, 20, 20);
  assert.ok(hit, 'a hit is reported');
  assert.deepEqual([hit.nx, hit.ny], [0, -1], 'top face');
});

test('rectHit returns null when the ball is clear', () => {
  const ball = { x: 5, y: 5, r: 3 };
  assert.equal(E.rectHit(ball, 40, 40, 20, 20), null);
});

/* ---------- paddle ---------- */

test('the paddle centre is clamped inside the walls', () => {
  const w = E.createWorld();
  E.setPaddle(w, -500);
  assert.ok(w.paddle.x >= L.WALL + w.paddle.w / 2, 'not past the left wall');
  E.setPaddle(w, 99999);
  assert.ok(w.paddle.x <= L.W - L.WALL - w.paddle.w / 2, 'not past the right wall');
});

test('nudgePaddle moves relative to the current position', () => {
  const w = E.createWorld();
  w.paddle.x = 400;
  E.nudgePaddle(w, 30);
  assert.equal(w.paddle.x, 430);
});

test('a held ball rides on top of the paddle', () => {
  const w = E.createWorld();
  E.setPaddle(w, 300);
  const p = E.heldBallPos(w);
  assert.equal(p.x, 300);
  assert.ok(p.y < L.PADDLE_Y, 'sits above the paddle top');
});

/* ---------- launch ---------- */

test('launch releases the held ball upward and clears the held flag', () => {
  const w = E.createWorld();
  assert.equal(w.held, true);
  assert.equal(E.launch(w), true);
  assert.equal(w.held, false);
  assert.equal(w.balls.length, 1);
  assert.ok(w.balls[0].vy < 0, 'travels upward');
});

test('launch is a no-op with no ball waiting', () => {
  const w = E.createWorld();
  E.launch(w);
  assert.equal(E.launch(w), false, 'second launch does nothing');
  assert.equal(w.balls.length, 1);
});

test('launch speed matches the level speed', () => {
  const w = E.createWorld();
  w.level = 3;
  E.launch(w);
  const b = w.balls[0];
  assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - E.levelSpeed(3)) < 1e-6);
});

/* ---------- ball dynamics ---------- */

test('a ball bounces off the side walls and keeps its speed', () => {
  const w = emptyWorld();
  const spd = 300;
  w.balls = [{ x: L.WALL + 5, y: 300, vx: -spd, vy: 0, r: L.BALL_R }];
  const before = Math.hypot(w.balls[0].vx, w.balls[0].vy);
  E.step(w, 1 / 60);
  assert.ok(w.balls[0].vx > 0, 'reversed to travel right');
  assert.ok(Math.abs(Math.hypot(w.balls[0].vx, w.balls[0].vy) - before) < 1e-6, 'speed preserved');
});

test('a ball bounces off the top wall', () => {
  const w = emptyWorld();
  w.balls = [{ x: 400, y: L.WALL + 3, vx: 0, vy: -300, r: L.BALL_R }];
  E.step(w, 1 / 60);
  assert.ok(w.balls[0].vy > 0, 'now heading down');
});

test('the paddle sends a centre hit straight up and edge hits outward', () => {
  const w = emptyWorld();
  E.setPaddle(w, 400);

  // centre strike
  w.balls = [{ x: 400, y: L.PADDLE_Y - 2, vx: 0, vy: 200, r: L.BALL_R }];
  E.step(w, 1 / 60);
  assert.ok(Math.abs(w.balls[0].vx) < 1e-6, 'centre goes straight up');
  assert.ok(w.balls[0].vy < 0);

  // right-edge strike kicks the ball to the right
  const w2 = emptyWorld();
  E.setPaddle(w2, 400);
  w2.balls = [{ x: 400 + w2.paddle.w / 2 - 2, y: L.PADDLE_Y - 2, vx: 0, vy: 200, r: L.BALL_R }];
  E.step(w2, 1 / 60);
  assert.ok(w2.balls[0].vx > 0, 'right edge deflects right');
  assert.ok(w2.balls[0].vy < 0, 'still upward');
});

test('the paddle ignores a ball travelling upward', () => {
  const w = emptyWorld();
  E.setPaddle(w, 400);
  w.balls = [{ x: 400, y: L.PADDLE_Y - 2, vx: 0, vy: -200, r: L.BALL_R }];
  E.step(w, 1 / 60);
  assert.ok(w.balls[0].vy < 0, 'left alone, still rising');
});

/* ---------- bricks ---------- */

test('a ball hitting a brick damages it and bounces', () => {
  const w = emptyWorld();
  const bw = E.brickWidth();
  w.bricks = [{ x: 400, y: 200, w: bw, h: L.BRICK_H, row: 5, col: 0, hp: 2, maxhp: 2, alive: true, flash: 0 }];
  // ball rising into the underside of the brick
  w.balls = [{ x: 400 + bw / 2, y: 200 + L.BRICK_H + 3, vx: 0, vy: -300, r: L.BALL_R }];
  E.step(w, 1 / 60);
  assert.equal(w.bricks[0].hp, 1, 'lost one hp');
  assert.ok(w.bricks[0].alive, 'still standing at 1 hp');
  assert.ok(w.balls[0].vy > 0, 'bounced back downward');
});

test('destroying a brick scores and removes it', () => {
  const w = emptyWorld();
  const bw = E.brickWidth();
  w.bricks = [{ x: 400, y: 200, w: bw, h: L.BRICK_H, row: 5, col: 0, hp: 1, maxhp: 1, alive: true, flash: 0 }];
  w.balls = [{ x: 400 + bw / 2, y: 200 + L.BRICK_H + 3, vx: 0, vy: -300, r: L.BALL_R }];
  const before = w.score;
  E.step(w, 1 / 60);
  assert.equal(w.bricks[0].alive, false);
  assert.ok(w.score > before, 'score went up');
});

test('at most one brick is resolved per sub-step', () => {
  // two adjacent bricks; a ball wedged at their shared corner must not
  // double-bounce and reverse into itself
  const w = emptyWorld();
  const bw = 30;
  w.bricks = [
    { x: 370, y: 200, w: bw, h: L.BRICK_H, row: 5, col: 0, hp: 1, maxhp: 1, alive: true, flash: 0 },
    { x: 400, y: 200, w: bw, h: L.BRICK_H, row: 5, col: 1, hp: 1, maxhp: 1, alive: true, flash: 0 },
  ];
  w.balls = [{ x: 400, y: 200 + L.BRICK_H + 2, vx: 0, vy: -300, r: L.BALL_R }];
  E.step(w, 1 / 60);
  const killed = w.bricks.filter(b => !b.alive).length;
  assert.equal(killed, 1, 'exactly one brick broken in the frame');
});

/* ---------- lives and level flow ---------- */

test('a ball lost past the floor costs a life and re-racks', () => {
  const w = emptyWorld();
  w.held = false;
  w.balls = [{ x: 400, y: L.H - 1, vx: 0, vy: 400, r: L.BALL_R }];
  const lives = w.lives;
  E.step(w, 1 / 30);
  assert.equal(w.lives, lives - 1, 'one life spent');
  assert.equal(w.held, true, 'a fresh ball is racked on the paddle');
  assert.equal(w.over, false);
});

test('losing the last life ends the run', () => {
  const w = emptyWorld();
  w.lives = 1; w.held = false;
  w.balls = [{ x: 400, y: L.H - 1, vx: 0, vy: 400, r: L.BALL_R }];
  E.step(w, 1 / 30);
  assert.equal(w.lives, 0);
  assert.equal(w.over, true);
  assert.equal(w.running, false);
});

test('clearing every brick flags the level clear and pays a bonus', () => {
  const w = emptyWorld();
  const bw = E.brickWidth();
  w.bricks = [{ x: 400, y: 200, w: bw, h: L.BRICK_H, row: 5, col: 0, hp: 1, maxhp: 1, alive: true, flash: 0 }];
  w.balls = [{ x: 400 + bw / 2, y: 200 + L.BRICK_H + 3, vx: 0, vy: -300, r: L.BALL_R }];
  const before = w.score;
  E.step(w, 1 / 60);
  assert.equal(w.levelClear, true);
  assert.ok(w.score >= before + 100 + w.level * 50, 'clear bonus applied on top of the brick');
});

test('nextLevel advances, rebuilds, and racks a fresh ball', () => {
  const w = E.createWorld();
  w.levelClear = true; w.level = 1;
  E.nextLevel(w);
  assert.equal(w.level, 2);
  assert.equal(w.levelClear, false);
  assert.equal(w.held, true);
  assert.ok(w.bricks.length > 0);
  assert.equal(w.running, true);
});

test('resetGame restores a clean level 1', () => {
  const w = E.createWorld();
  w.level = 5; w.score = 9999; w.lives = 1; w.over = true;
  E.resetGame(w);
  assert.equal(w.level, 1);
  assert.equal(w.score, 0);
  assert.equal(w.lives, E.START_LIVES);
  assert.equal(w.over, false);
  assert.equal(w.bricks.length, L.BRICK_ROWS * L.BRICK_COLS);
});

/* ---------- full-run sanity ---------- */

test('a long rally never lets the ball escape the playfield sideways or up', () => {
  const w = E.createWorld();
  w.running = true;
  E.launch(w);
  // sweep the paddle back and forth and simulate a few thousand frames
  let t = 0;
  for (let i = 0; i < 4000 && !w.over; i++) {
    t += 1 / 60;
    E.setPaddle(w, L.W / 2 + Math.sin(t * 3) * 200);
    E.step(w, 1 / 60);
    for (const b of w.balls) {
      assert.ok(b.x >= L.WALL - b.r - 1 && b.x <= L.W - L.WALL + b.r + 1, `ball in x bounds at frame ${i}`);
      assert.ok(b.y >= L.WALL - b.r - 1, `ball never punches through the top at frame ${i}`);
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), 'no NaN positions');
    }
    if (w.held) E.launch(w);        // relaunch after any life lost
    if (w.levelClear) E.nextLevel(w);
  }
  assert.ok(true, 'survived the rally without an assertion firing');
});

test('a ball fired straight down is always caught by a centred paddle', () => {
  const w = emptyWorld();
  // a decoy brick off in the corner keeps the board non-empty, so the run
  // doesn't flag "level clear" (which would freeze the ball) mid-test. The
  // ball travels straight up/down the centre line and never reaches it.
  w.bricks = [{ x: 40, y: 72, w: 20, h: 20, row: 0, col: 0, hp: 9, maxhp: 9, alive: true, flash: 0 }];
  E.setPaddle(w, 400);
  w.held = false;
  w.balls = [{ x: 400, y: L.PADDLE_Y - 60, vx: 0, vy: 300, r: L.BALL_R }];
  for (let i = 0; i < 30; i++) E.step(w, 1 / 60);
  assert.equal(w.balls.length, 1, 'the ball was returned, not dropped');
  assert.ok(w.balls[0].vy < 0, 'and is heading back up');
});
