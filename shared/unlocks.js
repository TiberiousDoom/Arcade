/* First-play-through gating: the cabinet opens with one game, and the rest
   unlock as you get somewhere in the one before.

   Each cabinet orders its own games, and the two orders are independent —
   see the note on GATES below.

   Deliberately **cabinet-only**. Direct URLs, bookmarks and the installed
   PWA's shortcuts all still open any game, and the manifest is untouched.
   That is an accepted decision, not an oversight: enforcing it inside each
   shell would mean four redirect paths and a way to strand someone who
   deep-linked, to protect single-player progression that nobody is cheating
   but the owner. Locking the front door is the whole intent.

   Same guarded-storage shape as shared/levels.js and shared/scores.js —
   localStorage genuinely throws in Safari private browsing and under some
   storage policies, and an unlock record is not worth crashing a game over.

   Progress is recorded by the games (see each shell's frame loop) rather
   than inferred from `scores.js`, which only writes on a *better* score and
   would silently miss a short run after a good one. */

const KEY = (game) => `arcade:progress:${game}`;

const memory = new Map();

function readRaw(k) {
  try { return localStorage.getItem(k); }
  catch { return memory.has(k) ? memory.get(k) : null; }
}
function writeRaw(k, v) {
  try { localStorage.setItem(k, v); }
  catch { memory.set(k, v); }
}

/** Furthest progress recorded for a game, as a plain number. Feedline stores
 *  1 for "has finished a run at all"; the wave games store the best wave. */
export function progress(game) {
  const n = parseInt(readRaw(KEY(game)), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Record progress. Only writes when it beats what is already stored, so a
 *  short run after a long one never walks the record backwards. */
export function recordProgress(game, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return;
  if (value > progress(game)) writeRaw(KEY(game), String(Math.floor(value)));
}

/** What each gated game waits on. `needs` is the game that must be played,
 *  `at` the progress value that opens the next door, and `label` is what the
 *  cabinet shows on a locked card.
 *
 *  **A gate never crosses cabinets.** There are two front doors now — Flak
 *  Battery opens the invasion cabinet, Feedline opens the classics — and each
 *  is absent here because each is always open. Gating one cabinet behind the
 *  other would mean a player who only wants Snake has to play a tower defense
 *  first, which is exactly the mismatch splitting them was meant to end. */
export const GATES = {
  'choke-point':  { needs: 'flak-battery', at: 10, label: 'Reach wave 10 in Flak Battery' },
  'hull-breach':  { needs: 'feedline',     at: 1,  label: 'Finish a run of Feedline' },
};

/** Is this game playable yet? Ungated games are always true. */
export function isUnlocked(game) {
  const gate = GATES[game];
  if (!gate) return true;
  return progress(gate.needs) >= gate.at;
}

/** What a locked game is waiting for, or null if it is open. */
export function lockLabel(game) {
  return isUnlocked(game) ? null : GATES[game].label;
}
