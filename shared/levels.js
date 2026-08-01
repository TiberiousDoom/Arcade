/* Highest level reached per game, kept in localStorage.

   Built for Hull Breach's level-select: the grid shows 1..maxLevel(game),
   growing as the player advances, with no artificial cap — the game's
   levels are generated forever (brickPresent cycles every 4), so there is
   no natural "last level" to design a fixed grid around.

   Same guarded-access shape as shared/scores.js: localStorage genuinely
   throws in some real situations (Safari private browsing, storage
   disabled by policy), and losing track of a player's furthest level is
   not worth crashing a game over. */

const KEY = (game) => `arcade:maxlevel:${game}`;

const memory = new Map();

function readRaw(k) {
  try { return localStorage.getItem(k); }
  catch { return memory.has(k) ? memory.get(k) : null; }
}
function writeRaw(k, v) {
  try { localStorage.setItem(k, v); }
  catch { memory.set(k, v); }
}

/** The highest level ever reached for a game, or 1 if none is recorded. */
export function maxLevel(game) {
  const raw = readRaw(KEY(game));
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Record having reached `level`. Only writes when it's a new furthest point. */
export function recordLevel(game, level) {
  if (typeof level !== 'number' || !Number.isFinite(level) || level < 1) return;
  if (level > maxLevel(game)) writeRaw(KEY(game), String(Math.floor(level)));
}
