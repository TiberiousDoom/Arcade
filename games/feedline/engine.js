/* Feedline — pure logic core.
   No DOM, no canvas, no timers. The only randomness is a seeded LCG (`rand`),
   so a given seed replays a run exactly — which is what makes food placement
   testable. The HTML shell owns rendering, input, and the frame loop. */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- board ---------- */

/** 32x18 cells of 25px — 800x450, near enough 16:9 to fill a phone held
 *  sideways.
 *
 *  The landscape and portrait grids are deliberately exact **transposes** of
 *  one another. That is what lets rotation be lossless: turning the phone
 *  simply turns the board, mapping every cell (x, y) to (y, x), so the wire
 *  keeps its exact shape rather than being rebuilt. See `relayout`. */
export const LAYOUT = {
  COLS: 32, ROWS: 18, CELL: 25,
  get W() { return this.COLS * this.CELL; },
  get H() { return this.ROWS * this.CELL; },
};

/** Portrait phones get a taller, narrower grid at the same cell size.
 *
 *  No pace adjustment is needed, unlike Hull Breach: the tick rate is seconds
 *  *per cell*, so reaction time per move — which is the whole difficulty curve
 *  — is identical on any grid. A portrait board is a slightly shorter game
 *  simply because there are fewer cells to fill.
 *
 *  No thumb-rest band either: steering is a flick, not a hold, so a finger is
 *  never parked over the board the way it is in Hull Breach or Flak Battery. */
export const LAYOUT_TALL = {
  // The exact transpose of LAYOUT — 450x800. Same cell count, same game, just
  // stood on its end. Keep these two mirrored: `relayout` relies on it, and a
  // test pins it.
  COLS: LAYOUT.ROWS, ROWS: LAYOUT.COLS, CELL: LAYOUT.CELL,
  get W() { return this.COLS * this.CELL; },
  get H() { return this.ROWS * this.CELL; },
};

export const idx = (L, x, y) => y * L.COLS + x;
export const inBounds = (L, x, y) => x >= 0 && y >= 0 && x < L.COLS && y < L.ROWS;

/* ---------- pace ---------- */

/** Seconds per tick. The wire speeds up as it eats, which is the entire
 *  difficulty curve — there are no levels, just an ever-shorter reaction time.
 *
 *  The opening was too fast to learn on: at 0.145 a new player had about a
 *  seventh of a second per cell from the very first move, before knowing what
 *  the controls did. `START_TICK` is slower now, and `TICK_STEP` gentler so
 *  the ramp doesn't simply claw it all back within a few meals — the floor
 *  used to arrive after 34 meals and now takes 60, which is a long game. The
 *  floor itself is unchanged: top speed was never the complaint. */
export const START_TICK = 0.185;
export const TICK_STEP = 0.0021;
export const MIN_TICK = 0.06;

export function tickRate(w) {
  return Math.max(MIN_TICK, START_TICK - w.eaten * TICK_STEP);
}

/* ---------- scoring ---------- */

export const FOOD_SCORE = 10;
export const BONUS_SCORE = 50;
export const GROW_PER_FOOD = 2;

/** A bonus appears every few normal foods and expires on a tick timer, so it's
 *  a decision — detour for it now, or keep working the safe line you're on. */
export const BONUS_EVERY = 5;
export const BONUS_TTL = 42;        // in ticks

/* ---------- randomness ---------- */

/* `Math.imul`, not `*`. The multiply overflows 2^53 for any seed above about
   8 million, and a float that has lost its low bits is then masked to 31 —
   which throws away exactly the bits an LCG carries its randomness in. Seeded
   from a constant nobody noticed; seeded from `Date.now()` it collapsed the
   sequence onto a coarse lattice. Measured in Feedline: a clock-seeded first
   food could land in **8 of 32 columns**, against all 32 with a small seed,
   which is why the opening food kept landing in the same few places and why
   retrying — which reseeds from a small constant — looked like it fixed it.
   `imul` is exact 32-bit multiplication, so every seed behaves like the small
   ones always did. */
/** Same LCG as Flak Battery's drop roll. Deterministic per seed. */
export function rand(w) {
  return (w.seed = (Math.imul(w.seed, 1103515245) + 12345) & 0x7fffffff);
}

/** Every cell not occupied by the wire, the food, or the bonus. Returned in a
 *  stable order so a seed picks the same cell every replay. */
export function freeCells(w) {
  const L = w.L;
  const taken = new Set(w.wire.map(s => idx(L, s.x, s.y)));
  if (w.food) taken.add(idx(L, w.food.x, w.food.y));
  if (w.bonus) taken.add(idx(L, w.bonus.x, w.bonus.y));
  const out = [];
  for (let y = 0; y < L.ROWS; y++) {
    for (let x = 0; x < L.COLS; x++) {
      if (!taken.has(idx(L, x, y))) out.push({ x, y });
    }
  }
  return out;
}

/** Place the next food. Returns false when the board is full — which means the
 *  wire has eaten everything, the one way to actually win. */
export function spawnFood(w) {
  const cells = freeCells(w);
  if (cells.length === 0) { w.food = null; return false; }
  w.food = cells[rand(w) % cells.length];
  return true;
}

export function spawnBonus(w) {
  const cells = freeCells(w);
  if (cells.length === 0) return false;
  const c = cells[rand(w) % cells.length];
  w.bonus = { x: c.x, y: c.y, ttl: BONUS_TTL };
  return true;
}

/* ---------- world ---------- */

export const START_LEN = 4;

/** The opening wire: laid out horizontally in the middle of the board, head
 *  at index 0, already moving right. */
function startWire(L) {
  const y = Math.floor(L.ROWS / 2);
  const x = Math.floor(L.COLS / 3);
  const cells = [];
  for (let i = 0; i < START_LEN; i++) cells.push({ x: x - i, y });
  return cells;
}

/* ---------- checkpoints ----------

   Filling the board is a 576-cell job: 286 meals from a starting length of 4,
   roughly 3,300 ticks, and about four and a half minutes of *flawless* play.
   The length is not the problem — 226 of those 286 meals happen after the tick
   rate has bottomed out at 16.7 cells a second, with a wire hundreds of cells
   long threading through itself. One mistake in minute four costs all of it,
   which is what made the win read as theoretical rather than hard.

   Checkpoints cut it into four. Crossing a quarter of the board banks the run;
   losing after that offers to drop you back to the last bank rather than to
   length 4. Each one is a small win in its own right, which a single
   unbroken 286-meal climb never gave anyone.

   Banked as `{ eaten, score }` rather than as a board: the wire's exact coils
   at the moment of a checkpoint are not worth restoring even if they could be —
   they are usually the shape that just killed you. `eaten` carries both the
   length and the speed, since both derive from it. */
/* Quarters were the first attempt and they failed on their own terms. The first
   bank sat at 25% of the board — 70 meals, length 144, about eighty seconds of
   *clean* play — so an ordinary run died long before reaching one. The feature
   shipped, was tested, and was reported as never implemented, which is the
   correct thing to conclude when you have never seen it fire.

   A mini win has to arrive early enough to be met. This ladder banks first at
   5% (13 meals, roughly twenty-five seconds), then spaces out as the run gets
   genuinely hard, so a short run still gets one or two and a deep run still has
   something ahead of it. */
export const CHECKPOINTS = [0.05, 0.09, 0.14, 0.20, 0.28, 0.38, 0.50, 0.64, 0.80];

/** Cells the wire occupies at a given meal count. */
export const lengthAt = (eaten) => START_LEN + eaten * GROW_PER_FOOD;

/** Meals needed to fill a board — the whole game, in one number. */
export const mealsToWin = (L) =>
  Math.ceil((L.COLS * L.ROWS - START_LEN) / GROW_PER_FOOD);

/** The checkpoint index a run has reached, or -1 for none yet. */
export function checkpointReached(w) {
  const filled = lengthAt(w.eaten) / (w.L.COLS * w.L.ROWS);
  let hit = -1;
  for (let i = 0; i < CHECKPOINTS.length; i++) if (filled >= CHECKPOINTS[i]) hit = i;
  return hit;
}

/** Lay out a wire of `len` cells as a serpentine from the top-left, head at
 *  index 0. A resumed checkpoint can be hundreds of cells long, which will not
 *  fit in a straight line — folding it is the only shape that both fits and
 *  leaves the player somewhere legal to move. */
export function layoutWire(L, len) {
  const cells = [];
  const max = L.COLS * L.ROWS;
  const n = Math.max(1, Math.min(len, max));
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / L.COLS);
    const col = row % 2 === 0 ? i % L.COLS : L.COLS - 1 - (i % L.COLS);
    cells.push({ x: col, y: row });
  }
  // head at index 0: the serpentine is built tail-first, so reverse it
  cells.reverse();
  return cells;
}

/** Restart from a banked checkpoint. Returns false if there is nothing banked,
 *  so the shell can hide the option rather than offer a dead button. */
export function resumeFromCheckpoint(w, bank) {
  if (!bank || !Number.isFinite(bank.eaten) || bank.eaten <= 0) return false;
  const eaten = Math.max(0, Math.floor(bank.eaten));
  resetGame(w);
  w.eaten = eaten;
  w.score = Math.max(0, Math.floor(bank.score) || 0);
  w.wire = layoutWire(w.L, lengthAt(eaten));
  /* Point the head somewhere it can actually go.

     The obvious rule — carry on the way the fold was running — is wrong
     whenever the serpentine ends flush against a wall, which happens exactly
     when the length is a multiple of the row width. A 144-cell wire on the
     18-wide portrait board fills eight rows precisely, leaving the head in the
     corner facing off the edge and dead on the first tick.

     So the direction is *searched* rather than derived: try continuing, then
     the turns, and take the first that lands on a free cell inside the board. */
  const head = w.wire[0], next = w.wire[1];
  const along = next ? { x: Math.sign(head.x - next.x), y: Math.sign(head.y - next.y) }
                     : { x: 1, y: 0 };
  const body = new Set(w.wire.map(c => c.x + ',' + c.y));
  /* Pick the direction with the most room, not merely the first legal one.
     A short resumed wire lies along one row: at 30 cells on a 32-wide board the
     head sits at column 29, so "carry on the way the fold was running" is legal
     for exactly two ticks and then hits the wall. Scoring by how far each
     option can actually run picks the open board instead. */
  const runLength = (d) => {
    let n = 0, x = head.x, y = head.y;
    for (;;) {
      x += d.x; y += d.y;
      if (!inBounds(w.L, x, y) || body.has(x + ',' + y)) return n;
      n++;
    }
  };
  const options = [along, { x: along.y, y: along.x }, { x: -along.y, y: -along.x },
                   { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
    .filter(d => d.x || d.y);
  let bestDir = { x: 1, y: 0 }, bestRun = -1;
  for (const d of options) {
    const n = runLength(d);
    if (n > bestRun) { bestRun = n; bestDir = d; }
  }
  w.dir = bestDir;
  w.queue = [];
  w.food = null; w.bonus = null;
  spawnFood(w);
  return true;
}

export function createWorld(opts = {}) {
  const L = { ...LAYOUT, ...(opts.layout || {}) };
  const w = {
    L,
    wire: startWire(L),
    dir: { x: 1, y: 0 },
    queue: [],
    grow: 0,
    food: null, bonus: null,
    eaten: 0, score: 0,
    acc: 0,
    running: false, over: false, won: false,
    /* Highest checkpoint crossed this run, and the one-frame edge the shell
       catches to celebrate it. Same split as Choke Point's won/justWon. */
    checkpoint: -1, justCheckpoint: false,
    seed: opts.seed ?? 20260722,
    fx: opts.fx || { eat() {}, bonus() {}, die() {} },
  };
  spawnFood(w);
  return w;
}

/** Restart. `seed` is optional so tests keep their fixed, replayable run while
 *  the shell hands in a fresh one — every retry used to reuse one hardcoded
 *  constant, so the food sequence after a death was identical every single
 *  time, in a game whose only variable is where the food goes. */
export function resetGame(w, seed) {
  w.wire = startWire(w.L);
  w.dir = { x: 1, y: 0 };
  w.queue = [];
  w.grow = 0;
  w.food = null; w.bonus = null;
  w.eaten = 0; w.score = 0;
  w.acc = 0;
  w.over = false; w.won = false;
  w.checkpoint = -1; w.justCheckpoint = false;
  w.seed = (seed ?? 20260722) & 0x7fffffff;
  spawnFood(w);
}

/** Move an in-progress game onto the other grid, as when the phone is turned.
 *
 *  The two layouts are exact transposes, so this is **lossless**: every cell
 *  maps (x, y) -> (y, x) and the wire keeps its precise shape, direction,
 *  food and bonus. Turning the phone turns the board — which is what a player
 *  physically just did, so it is also the least surprising thing that could
 *  happen.
 *
 *  An earlier version rebuilt the wire from its length alone, because the
 *  grids were arbitrary sizes and no honest mapping existed. Making them
 *  mirror images removed the problem rather than papering over it. */
export function relayout(w, L2) {
  const flip = (c) => ({ ...c, x: c.y, y: c.x });
  w.wire = w.wire.map(flip);
  w.dir = { x: w.dir.y, y: w.dir.x };
  w.queue = w.queue.map(d => ({ x: d.y, y: d.x }));
  if (w.food) w.food = flip(w.food);
  if (w.bonus) w.bonus = flip(w.bonus);
  w.L = L2;
  return w;
}

/* ---------- input ---------- */

/** How many turns can be buffered. Two is the sweet spot: it lets you set up a
 *  quick right-angle jink (up, then left) inside a single tick without letting
 *  a mashed key queue up a long string of moves you no longer want. */
export const MAX_QUEUE = 2;

/** Queue a direction change. Rejects reversals — the wire can't turn back
 *  into its own neck — and duplicates, which would waste a queue slot.
 *  Validates against the last *queued* direction, not the current one, so a
 *  buffered pair of turns is checked as the player will actually experience it. */
export function turn(w, dx, dy) {
  if (w.over) return false;
  if (w.queue.length >= MAX_QUEUE) return false;
  const ref = w.queue.length ? w.queue[w.queue.length - 1] : w.dir;
  if (dx === -ref.x && dy === -ref.y) return false;
  if (dx === ref.x && dy === ref.y) return false;
  w.queue.push({ x: dx, y: dy });
  return true;
}

/* ---------- death ---------- */

function die(w) {
  w.over = true;
  w.running = false;
  w.fx.die();
}

/* ---------- one discrete tick ---------- */

/** Advance the wire exactly one cell. Exported so tests can drive precise
 *  steps without going through the time accumulator. */
export function tick(w) {
  if (w.over) return;

  if (w.queue.length) w.dir = w.queue.shift();

  const head = w.wire[0];
  const nx = head.x + w.dir.x, ny = head.y + w.dir.y;

  if (!inBounds(w.L, nx, ny)) { die(w); return; }

  // The tail cell frees up this tick unless the wire is mid-growth, so moving
  // into it is legal — without this, following your own tail is a false death.
  const body = w.grow === 0 ? w.wire.slice(0, -1) : w.wire;
  if (body.some(s => s.x === nx && s.y === ny)) { die(w); return; }

  w.wire.unshift({ x: nx, y: ny });

  if (w.food && w.food.x === nx && w.food.y === ny) {
    w.score += FOOD_SCORE;
    w.eaten++;
    w.grow += GROW_PER_FOOD;
    w.fx.eat(nx, ny);
    if (!spawnFood(w)) { w.won = true; w.over = true; w.running = false; }
    // a bonus rides in every few foods, but never two at once
    if (!w.bonus && w.eaten % BONUS_EVERY === 0) spawnBonus(w);
    // crossing a quarter of the board banks the run
    const cp = checkpointReached(w);
    if (cp > w.checkpoint) { w.checkpoint = cp; w.justCheckpoint = true; }
  } else if (w.bonus && w.bonus.x === nx && w.bonus.y === ny) {
    w.score += BONUS_SCORE;
    w.bonus = null;
    w.fx.bonus(nx, ny);
  }

  if (w.grow > 0) w.grow--;
  else w.wire.pop();

  if (w.bonus) {
    w.bonus.ttl--;
    if (w.bonus.ttl <= 0) w.bonus = null;
  }
}

/* ---------- simulation step ---------- */

/** Advance by dt seconds, running as many ticks as have come due. The tick
 *  clock lives here rather than in the shell because the pace *is* the
 *  difficulty curve — it's a game rule, not a rendering concern. */
export function step(w, dt) {
  if (!w.running || w.over) return;
  w.acc += dt;
  // guard against a huge dt (tab regains focus) turning into a burst of ticks
  const rate = tickRate(w);
  let budget = 8;
  while (w.acc >= rate && budget-- > 0 && !w.over) {
    w.acc -= rate;
    tick(w);
  }
  if (w.acc > rate) w.acc = 0;
}

/** Fraction of the way to the next tick, for the shell to interpolate the
 *  wire's slide between cells. Purely presentational, but derived from engine
 *  state so the two can't drift apart. */
export function tickProgress(w) {
  return clamp(w.acc / tickRate(w), 0, 1);
}
