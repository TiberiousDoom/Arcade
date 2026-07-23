/* Live Wire — pure logic core.
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
 *  No pace adjustment is needed, unlike Angle Iron: the tick rate is seconds
 *  *per cell*, so reaction time per move — which is the whole difficulty curve
 *  — is identical on any grid. A portrait board is a slightly shorter game
 *  simply because there are fewer cells to fill.
 *
 *  No thumb-rest band either: steering is a flick, not a hold, so a finger is
 *  never parked over the board the way it is in Angle Iron or Serpent Battery. */
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
 *  difficulty curve — there are no levels, just an ever-shorter reaction time. */
export const START_TICK = 0.145;
export const TICK_STEP = 0.0025;
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

/** Same LCG as Serpent Battery's drop roll. Deterministic per seed. */
export function rand(w) {
  return (w.seed = (w.seed * 1103515245 + 12345) & 0x7fffffff);
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
    seed: opts.seed ?? 20260722,
    fx: opts.fx || { eat() {}, bonus() {}, die() {} },
  };
  spawnFood(w);
  return w;
}

export function resetGame(w) {
  w.wire = startWire(w.L);
  w.dir = { x: 1, y: 0 };
  w.queue = [];
  w.grow = 0;
  w.food = null; w.bonus = null;
  w.eaten = 0; w.score = 0;
  w.acc = 0;
  w.over = false; w.won = false;
  w.seed = 20260722;
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
