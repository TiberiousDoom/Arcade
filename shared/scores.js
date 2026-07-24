/* Personal bests, kept in localStorage.

   Deliberately local-only: no account, no server, no identifier of any kind.
   That keeps Apple's privacy label at "Data Not Collected" and Play's Data
   Safety form empty, which is where most store-submission pain lives. A
   leaderboard would mean a backend and a whole compliance surface — see
   docs/DECISIONS.md before adding one.

   Values are namespaced under `arcade:best:<game>` so they can't collide with
   anything else on the origin (which matters on GitHub Pages, where every
   project site shares one). */

const KEY = (game) => `arcade:best:${game}`;

/** localStorage throws rather than returning null in a few real situations —
 *  Safari private browsing, storage disabled by policy, quota exhausted. A
 *  high score is not worth crashing a game over, so every access is guarded
 *  and falls back to memory that lasts as long as the tab. */
const memory = new Map();
let warned = false;

function readRaw(k) {
  try { return localStorage.getItem(k); }
  catch { return memory.has(k) ? memory.get(k) : null; }
}
function writeRaw(k, v) {
  try { localStorage.setItem(k, v); }
  catch {
    memory.set(k, v);
    if (!warned) { warned = true; console.info('Scores kept in memory only — storage unavailable.'); }
  }
}

/**
 * The stored best for a game, or null if there isn't one yet.
 * @returns {{score:number, detail:string, at:number}|null}
 */
export function best(game) {
  const raw = readRaw(KEY(game));
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    // Anything could be sitting under this key — another tab, an older build,
    // a user poking at devtools. Only trust it if it looks right.
    if (typeof v?.score !== 'number' || !Number.isFinite(v.score)) return null;
    return { score: v.score, detail: String(v.detail ?? ''), at: Number(v.at) || 0 };
  } catch { return null; }
}

/**
 * Record a finished run. Only writes when it beats the stored best.
 * @param detail short context shown beside the score, e.g. "Wave 6"
 * @returns {{best:number, record:boolean}}
 */
export function submit(game, score, detail = '') {
  if (typeof score !== 'number' || !Number.isFinite(score)) return { best: best(game)?.score ?? 0, record: false };
  const prev = best(game);
  if (prev && score <= prev.score) return { best: prev.score, record: false };
  writeRaw(KEY(game), JSON.stringify({ score, detail, at: Date.now() }));
  return { best: score, record: true };
}

export function clear(game) {
  try { localStorage.removeItem(KEY(game)); } catch { memory.delete(KEY(game)); }
}
