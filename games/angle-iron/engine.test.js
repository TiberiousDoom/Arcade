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

/* ---------- portrait layout ---------- */

const TALL = E.LAYOUT_TALL;

test('the portrait board is actually portrait, and the landscape one is not', () => {
  assert.ok(TALL.H > TALL.W, 'taller than wide');
  assert.ok(L.W > L.H, 'landscape stays landscape');
});

test('the landscape board is unchanged by the addition of FLOOR', () => {
  // regression: THUMB/FLOOR were introduced for portrait and must not move
  // anything on the original board
  assert.equal(L.THUMB, 0);
  assert.equal(L.FLOOR, L.H);
  assert.equal(L.PADDLE_Y, 554, 'paddle sits exactly where it always did');
});

test('the portrait board reserves a thumb rest below the floor', () => {
  assert.ok(TALL.THUMB > 0);
  assert.equal(TALL.FLOOR, TALL.H - TALL.THUMB);
  assert.ok(TALL.PADDLE_Y < TALL.FLOOR, 'paddle sits above the floor line');
  assert.ok(TALL.FLOOR < TALL.H, 'and there is empty canvas below it to hold');
});

test('a ball crosses either board in the same time', () => {
  // the point of scaling speed by playable height: portrait must not play
  // slower and easier just because the board is taller
  const t = (LAY) => LAY.FLOOR / E.levelSpeed(1, LAY);
  assert.ok(Math.abs(t(L) - t(TALL)) < 1e-9, 'traversal time is layout-independent');
});

test('portrait speed is faster in absolute terms, since the board is taller', () => {
  assert.ok(E.levelSpeed(1, TALL) > E.levelSpeed(1, L));
});

test('a world built on the portrait layout is internally consistent', () => {
  const w = E.createWorld({ layout: TALL });
  assert.equal(w.L.W, TALL.W);
  assert.ok(w.bricks.length > 0);
  for (const b of w.bricks) {
    assert.ok(b.x >= TALL.MARGIN - 1e-6, 'brick within the left margin');
    assert.ok(b.x + b.w <= TALL.W - TALL.MARGIN + 1e-6, 'and the right');
    assert.ok(b.y + b.h < TALL.PADDLE_Y, 'no brick reaches the paddle');
  }
  const lim = TALL.WALL + w.paddle.w / 2;
  E.setPaddle(w, 99999);
  assert.ok(w.paddle.x <= TALL.W - lim, 'paddle clamps to the narrower board');
});

test('a portrait ball dies at the floor line, not the bottom of the canvas', () => {
  const w = E.createWorld({ layout: TALL });
  w.running = true; w.held = false;
  w.bricks = [{ x: 40, y: 100, w: 20, h: 20, row: 0, col: 0, hp: 9, maxhp: 9, alive: true, flash: 0 }];
  // sitting in the thumb band: past the floor, but still inside the canvas
  w.balls = [{ x: 300, y: TALL.FLOOR + 40, vx: 0, vy: 300, r: TALL.BALL_R }];
  assert.ok(TALL.FLOOR + 40 < TALL.H, 'setup: still on the canvas');
  E.step(w, 1 / 60);
  assert.equal(w.balls.length, 0, 'the ball was lost at the floor');
});

/* ---------- rotating the phone ---------- */

test('both layouts share one brick grid, which is what makes rotation lossless', () => {
  assert.equal(L.BRICK_ROWS, TALL.BRICK_ROWS);
  assert.equal(L.BRICK_COLS, TALL.BRICK_COLS);
  assert.equal(E.buildBricks(1, L).length, E.buildBricks(1, TALL).length);
});

test('relayout carries every brick\'s damage across, index for index', () => {
  const w = E.createWorld();
  E.nextLevel(w);              // reach level 2 properly, so bricks match the level
  w.score = 1234; w.lives = 2;
  // chew up the field: kill some outright, wound others
  w.bricks[0].alive = false;
  w.bricks[1].hp = 1;
  w.bricks[5].alive = false;
  const before = w.bricks.map(b => `${b.row},${b.col}:${b.hp}:${b.alive}`);

  E.relayout(w, TALL);

  assert.equal(w.L.W, TALL.W, 'moved onto the portrait board');
  assert.deepEqual(w.bricks.map(b => `${b.row},${b.col}:${b.hp}:${b.alive}`), before,
    'every brick kept its damage');
  assert.equal(w.score, 1234, 'score survives');
  assert.equal(w.lives, 2, 'lives survive');
  assert.equal(w.level, 2, 'level survives');
});

test('relayout re-racks the ball and refits the paddle', () => {
  const w = E.createWorld();
  E.launch(w);
  assert.equal(w.balls.length, 1);
  E.relayout(w, TALL);
  assert.equal(w.held, true, 'ball is racked, since its flight means nothing on a new board');
  assert.equal(w.balls.length, 0);
  assert.equal(w.paddle.w, TALL.PADDLE_W, 'paddle takes the new board\'s width');
  const lim = TALL.WALL + w.paddle.w / 2;
  assert.ok(w.paddle.x >= lim && w.paddle.x <= TALL.W - lim, 'and sits inside the new walls');
});

test('rotating out and back is a round trip', () => {
  const w = E.createWorld();
  w.bricks[3].alive = false;
  w.bricks[7].hp = 1;
  const before = w.bricks.map(b => `${b.hp}:${b.alive}`);
  E.relayout(w, TALL);
  E.relayout(w, L);
  assert.deepEqual(w.bricks.map(b => `${b.hp}:${b.alive}`), before);
  assert.equal(w.L.W, L.W);
});

test('the ball is still speed-correct after a relayout', () => {
  const w = E.createWorld();
  E.relayout(w, TALL);
  E.launch(w);
  const b = w.balls[0];
  assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - E.levelSpeed(w.level, TALL)) < 1e-6);
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

/* ---------- powerups ---------- */

/** Any test that steps more than once needs a surviving brick: an empty field
 *  flags levelClear, after which `step` early-returns and nothing advances.
 *  Parked in the top-left corner with absurd hp so a loose ball can't clear it. */
function decoy(w) {
  w.bricks.push({ x: L.MARGIN, y: L.WALL + 4, w: 20, h: L.BRICK_H,
                  row: 0, col: 0, hp: 1e9, maxhp: 1, alive: true, flash: 0 });
  return w;
}

/** A brick placed so a ball rising from below breaks it this frame. */
function brickToBreak(w, row = 5, col = 0) {
  const bw = E.brickWidth();
  w.bricks = [{ x: 400, y: 200, w: bw, h: L.BRICK_H, row, col, hp: 1, maxhp: 1, alive: true, flash: 0 }];
  w.balls = [{ x: 400 + bw / 2, y: 200 + L.BRICK_H + 3, vx: 0, vy: -300, r: L.BALL_R }];
}

test('drops are deterministic — the same level yields the same map every time', () => {
  for (const level of [1, 2, 3, 7]) {
    const a = [], b = [];
    for (let r = 0; r < L.BRICK_ROWS; r++) for (let c = 0; c < L.BRICK_COLS; c++) {
      a.push(E.dropFor(level, r, c));
      b.push(E.dropFor(level, r, c));
    }
    assert.deepEqual(a, b, `level ${level} is stable`);
  }
});

test('drops are sparse, and every kind shows up across the early levels', () => {
  let total = 0, dropped = 0;
  const seen = new Set();
  for (let level = 1; level <= 4; level++) {
    for (let r = 0; r < L.BRICK_ROWS; r++) for (let c = 0; c < L.BRICK_COLS; c++) {
      total++;
      const k = E.dropFor(level, r, c);
      if (k) { dropped++; seen.add(k); }
    }
  }
  const rate = dropped / total;
  assert.ok(rate > 0.05 && rate < 0.25, `drop rate ${(rate * 100).toFixed(0)}% is a treat, not a torrent`);
  assert.deepEqual([...seen].sort(), E.POWERUP_KEYS.slice().sort(), 'all four kinds appear');
  // every kind must be a real entry in the table the shell reads
  for (const k of seen) assert.ok(E.POWERUPS[k], `${k} is described in POWERUPS`);
});

test('breaking a brick that carries a drop spawns a falling capsule', () => {
  // find a cell that does drop on level 1, and one that does not
  let withDrop = null, without = null;
  for (let r = 0; r < L.BRICK_ROWS && (!withDrop || !without); r++) {
    for (let c = 0; c < L.BRICK_COLS; c++) {
      const k = E.dropFor(1, r, c);
      if (k && !withDrop) withDrop = { r, c, k };
      if (!k && !without) without = { r, c };
    }
  }
  assert.ok(withDrop && without, 'level 1 has both kinds of cell');

  const a = emptyWorld();
  brickToBreak(a, withDrop.r, withDrop.c);
  E.step(a, 1 / 60);
  assert.equal(a.drops.length, 1, 'capsule spawned');
  assert.equal(a.drops[0].kind, withDrop.k, 'and it is the kind the table promised');

  const b = emptyWorld();
  brickToBreak(b, without.r, without.c);
  E.step(b, 1 / 60);
  assert.equal(b.drops.length, 0, 'a plain brick drops nothing');
});

test('a capsule falls, is caught by the paddle, and is discarded past the floor', () => {
  const caught = decoy(emptyWorld());
  caught.drops = [{ kind: 'life', x: caught.paddle.x, y: L.PADDLE_Y - 60, vy: E.DROP_SPEED }];
  caught.balls = [{ x: 400, y: 300, vx: 0, vy: -300, r: L.BALL_R }];
  const lives = caught.lives;
  for (let i = 0; i < 60 && caught.drops.length; i++) E.step(caught, 1 / 60);
  assert.equal(caught.drops.length, 0, 'capsule consumed');
  assert.equal(caught.lives, lives + 1, 'and the paddle caught it');

  const missed = decoy(emptyWorld());
  missed.drops = [{ kind: 'life', x: L.WALL + 20, y: L.PADDLE_Y - 60, vy: E.DROP_SPEED }];
  missed.paddle.x = L.W - 100;          // paddle nowhere near it
  missed.balls = [{ x: 400, y: 300, vx: 0, vy: -300, r: L.BALL_R }];
  const lives2 = missed.lives;
  for (let i = 0; i < 200 && missed.drops.length; i++) E.step(missed, 1 / 60);
  assert.equal(missed.drops.length, 0, 'capsule gone');
  assert.equal(missed.lives, lives2, 'but nothing was granted');
});

test('split multiplies the balls, fans them out, and respects the ceiling', () => {
  const w = emptyWorld();
  w.balls = [{ x: 400, y: 300, vx: 0, vy: -300, r: L.BALL_R }];
  E.applyPowerup(w, 'multi');
  assert.equal(w.balls.length, 3, 'one became three');
  const headings = new Set(w.balls.map(b => Math.atan2(b.vy, b.vx).toFixed(3)));
  assert.equal(headings.size, 3, 'all three head somewhere different');
  for (const b of w.balls) {
    assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - 300) < 1e-6, 'speed unchanged by splitting');
  }
  // stacked splits taper instead of filling the board
  for (let i = 0; i < 5; i++) E.applyPowerup(w, 'multi');
  assert.ok(w.balls.length <= E.MAX_BALLS, `capped at ${E.MAX_BALLS}, got ${w.balls.length}`);
});

test('wide widens the paddle for a while, then puts it back', () => {
  const w = decoy(emptyWorld());
  const base = w.paddle.w;
  E.applyPowerup(w, 'wide');
  assert.ok(w.paddle.w > base, 'wider now');
  assert.ok(Math.abs(w.paddle.w - base * E.WIDE_MULT) < 1e-6);
  w.balls = [{ x: 400, y: 300, vx: 0, vy: -300, r: L.BALL_R }];
  for (let i = 0; i < 60 * (E.EFFECT_SECONDS + 1); i++) E.step(w, 1 / 60);
  assert.equal(w.effects.wide, 0, 'effect lapsed');
  assert.equal(w.paddle.w, base, 'and the paddle is back to normal');
});

test('a wide paddle at the wall is pushed back inside it', () => {
  const w = emptyWorld();
  E.setPaddle(w, 0);                    // hard against the left wall
  const atWall = w.paddle.x;
  E.applyPowerup(w, 'wide');
  assert.ok(w.paddle.x > atWall, 'the wider bar was nudged clear of the wall');
  assert.ok(w.paddle.x - w.paddle.w / 2 >= L.WALL - 1e-6, 'no overlap with the border');
});

test('slow scales live balls and the next launch, and restores full pace', () => {
  const w = decoy(emptyWorld());
  const full = E.levelSpeed(w.level, w.L);
  w.balls = [{ x: 400, y: 300, vx: 0, vy: -full, r: L.BALL_R }];
  E.applyPowerup(w, 'slow');
  assert.ok(Math.abs(Math.hypot(w.balls[0].vx, w.balls[0].vy) - full * E.SLOW_MULT) < 1e-6, 'ball slowed');
  assert.ok(Math.abs(E.effectiveSpeed(w) - full * E.SLOW_MULT) < 1e-6, 'and so is a new launch');
  for (let i = 0; i < 60 * (E.EFFECT_SECONDS + 1); i++) E.step(w, 1 / 60);
  assert.equal(w.effects.slow, 0, 'effect lapsed');
  assert.ok(Math.abs(Math.hypot(w.balls[0].vx, w.balls[0].vy) - full) < 1e-6, 'back to full pace');
  assert.ok(Math.abs(E.effectiveSpeed(w) - full) < 1e-6);
});

test('slow only changes magnitude, never direction', () => {
  const w = emptyWorld();
  const b = { x: 400, y: 300, vx: 120, vy: -260, r: L.BALL_R };
  w.balls = [b];
  const before = Math.atan2(b.vy, b.vx);
  E.applyPowerup(w, 'slow');
  assert.ok(Math.abs(Math.atan2(b.vy, b.vx) - before) < 1e-9, 'heading untouched');
});

test('losing a life clears capsules and running effects', () => {
  const w = emptyWorld();
  E.applyPowerup(w, 'wide');
  w.drops = [{ kind: 'multi', x: 400, y: 300, vy: E.DROP_SPEED }];
  w.balls = [{ x: 400, y: L.FLOOR - 1, vx: 0, vy: 400, r: L.BALL_R }];
  E.step(w, 1 / 30);
  assert.equal(w.drops.length, 0, 'capsules cleared');
  assert.equal(w.effects.wide, 0, 'effects cleared');
  assert.equal(w.paddle.w, L.PADDLE_W, 'paddle back to base width');
});

test('nextLevel and resetGame both start clean', () => {
  for (const advance of [E.nextLevel, E.resetGame]) {
    const w = emptyWorld();
    E.applyPowerup(w, 'wide');
    E.applyPowerup(w, 'slow');
    w.drops = [{ kind: 'multi', x: 400, y: 300, vy: E.DROP_SPEED }];
    advance(w);
    assert.deepEqual(w.effects, { wide: 0, slow: 0 });
    assert.equal(w.drops.length, 0);
    assert.equal(w.paddle.w, L.PADDLE_W);
  }
});

test('a relayout keeps earned effects but drops capsules in flight', () => {
  const w = E.createWorld();
  w.running = true;
  E.applyPowerup(w, 'wide');
  w.drops = [{ kind: 'multi', x: 400, y: 300, vy: E.DROP_SPEED }];
  E.relayout(w, E.LAYOUT_TALL);
  assert.equal(w.drops.length, 0, 'in-flight capsules do not survive a board change');
  assert.ok(w.effects.wide > 0, 'but the effect was earned, so it carries');
  assert.ok(Math.abs(w.paddle.w - E.LAYOUT_TALL.PADDLE_W * E.WIDE_MULT) < 1e-6,
    'and is re-applied against the new board\'s base width');
});

test('the fx.power hook fires on a pickup, and its absence is safe', () => {
  const seen = [];
  const w = E.createWorld({ fx: { brick() {}, bounce() {}, lose() {}, power: (k) => seen.push(k) } });
  E.applyPowerup(w, 'life');
  assert.deepEqual(seen, ['life']);
  // a world built without the hook (every older caller) must not throw
  const bare = E.createWorld();
  delete bare.fx.power;
  assert.doesNotThrow(() => E.applyPowerup(bare, 'life'));
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
