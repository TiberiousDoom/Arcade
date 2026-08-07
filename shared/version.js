/* The single source of truth for "which build is this?".

   This exists because of a real problem, not for decoration: the service worker
   serves cache-first without revalidating, so a phone can happily keep running
   an old build after a deploy, and there was no way to tell by looking. Now the
   help panel and the cabinet both show this string, so "is my phone on the new
   code?" is answerable in two taps.

   Deliberately ONE app-wide version rather than a version per game. Four
   hand-maintained numbers with no release process behind them would drift
   immediately, and a player does not care that Feedline is at 1.3.0 — the only
   question anyone actually asks is which deploy they are looking at.

   Keep this in lockstep with `CACHE_VERSION` in sw.js: the worker's cache name
   is what decides whether a client gets new files at all, so a build the user
   can see and a cache they can't must never disagree. `version.test.js` reads
   sw.js and fails if the two drift, so this is enforced rather than hoped for —
   bump both together. */
export const BUILD = 'v29';

/** Short human label, e.g. "Arcade v22". */
export const BUILD_LABEL = `Arcade ${BUILD}`;
