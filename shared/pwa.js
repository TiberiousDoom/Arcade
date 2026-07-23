/* Registers the service worker. Imported by every page, so landing directly on
   a game (from a home-screen shortcut, or a bookmark) installs the offline
   cache just as arriving at the cabinet does.

   The worker's URL is resolved against this module rather than written as an
   absolute '/sw.js', so the app keeps working when served from a subpath. A
   worker's default scope is its own directory — sw.js sits at the repo root,
   so it controls every page. */

if ('serviceWorker' in navigator) {
  // Registration competes with the game's first frames for the main thread;
  // waiting for load keeps it away from the opening animation.
  addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('../sw.js', import.meta.url))
      .catch(err => {
        // Not fatal — the games are fully playable without a worker, they just
        // will not survive going offline. Worth a console note, not a banner.
        console.warn('Offline support unavailable:', err.message);
      });
  });
}
