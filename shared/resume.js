/* Mid-run saves — "continue where you left off".

   Scores were easy: one number, write it when a run ends. A run in progress is
   the whole world, and it has to survive the app being closed on a phone, which
   happens constantly and without warning.

   Deliberately NOT in every game. Feedline is one-life score-attack: being able
   to resume a run is contrary to the genre, and a save would make its ladder
   meaningless. Choke Point and Flak Battery have long runs where losing
   progress genuinely stings, and Hull Breach is level-based, so those three get
   it.

   The engines own what a snapshot *is* (`snapshot(w)` / `hydrate(w, snap)`),
   because that is game rules and belongs where it can be unit-tested without a
   DOM. This module owns only storage: keys, versioning, and the fact that
   localStorage is allowed to fail. Same split, and the same defensive posture,
   as shared/scores.js. */

import { BUILD } from './version.js';

const KEY = (gameId) => `arcade:run:${gameId}`;

/* Every access is wrapped. localStorage genuinely throws in Safari private
   browsing and under some storage policies, and a saved game is never worth
   crashing a running one over. Unlike scores there is no in-memory fallback:
   a save that cannot outlive the tab has no purpose. */
function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function remove(key) {
  try { localStorage.removeItem(key); } catch { /* nothing useful to do */ }
}

/**
 * Store a snapshot of a run in progress.
 * @param gameId  the game's id, same one scores.js uses
 * @param snap    a plain, JSON-safe object from the engine's `snapshot()`
 * @param label   short human summary for the resume prompt ("Wave 7 · 3,400")
 */
export function saveRun(gameId, snap, label = '') {
  if (!snap) return false;
  return write(KEY(gameId), JSON.stringify({
    // Stamped with the build that wrote it. A snapshot is a picture of engine
    // internals, so a later build can easily have changed what those mean —
    // restoring across that boundary would produce a subtly corrupt run, which
    // is far worse than losing the save. See `loadRun`.
    build: BUILD,
    at: Date.now(),
    label,
    snap,
  }));
}

/**
 * The stored run for this game, or null if there isn't a usable one.
 * Returns `{ snap, label, at }`.
 */
export function loadRun(gameId) {
  const raw = read(KEY(gameId));
  if (!raw) return null;
  let parsed;
  // Anything could be under that key — another tab, an older build, someone
  // poking at devtools. Validate rather than trust, exactly like scores.best().
  try { parsed = JSON.parse(raw); } catch { clearRun(gameId); return null; }
  if (!parsed || typeof parsed !== 'object' || !parsed.snap) { clearRun(gameId); return null; }
  if (parsed.build !== BUILD) { clearRun(gameId); return null; }
  return { snap: parsed.snap, label: typeof parsed.label === 'string' ? parsed.label : '', at: parsed.at };
}

export function clearRun(gameId) { remove(KEY(gameId)); }

export function hasRun(gameId) { return loadRun(gameId) !== null; }
