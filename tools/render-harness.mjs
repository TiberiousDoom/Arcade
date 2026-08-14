/* Boot a real game shell in jsdom against a real node-canvas, so the draw path
   actually executes.

   Why this exists: the engine suites are pure logic and never touch a canvas,
   so a typo in a draw function — a missing color, a renamed field, an
   undefined lookup — sails past every one of them and only shows up as a blank
   or frozen screen in a browser. Worse, verifying by eye in a headless browser
   is unreliable: requestAnimationFrame is throttled to roughly 0.1fps there, so
   "is it even moving" cannot be answered honestly. Driving frames ourselves and
   asserting that nothing threw is the dependable version.

   Needs jsdom and canvas, which are not in the repo (there is no package.json):
       npm install --no-save jsdom canvas
*/

import { JSDOM } from 'jsdom';
import { createCanvas } from 'canvas';
import { inlineGame } from './inline.mjs';

/**
 * @param htmlPath  absolute path to a game shell
 * @param opts.width/height  backing canvas size; only needs to be big enough
 * @returns { window, errors, frame, world, E, draw }
 *
 * `errors` accumulates anything thrown during boot or during a frame — assert
 * it is empty. A shell that throws while initialising leaves `world` undefined,
 * which is the loudest possible signal that something is wrong.
 */
export function bootGame(htmlPath, { width = 900, height = 1300, storage = null } = {}) {
  let html = inlineGame(htmlPath)
    // jsdom does not execute `type="module"` scripts. The inlined script has no
    // imports left, so running it as a classic script is equivalent.
    .replace('<script type="module">', '<script>');

  // expose the shell's internals just before it starts its own loop
  html = html.replace(
    /requestAnimationFrame\(frame\);(?![\s\S]*requestAnimationFrame\(frame\);)/,
    'window.__world=world;window.__frame=frame;window.__E=E;' +
    'window.__draw=(typeof draw==="function"?draw:null);\nrequestAnimationFrame(frame);'
  );

  const surface = createCanvas(width, height);
  const ctx = surface.getContext('2d');
  const errors = [];

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    // localStorage needs a real origin; on the default about:blank jsdom throws
    // SecurityError on every access, which the games survive (they wrap it) but
    // which makes scores and saved runs impossible to test.
    url: 'http://localhost/',
    beforeParse(w) {
      // seed storage *before* the page scripts run, which is what makes
      // "reload with a saved run present" testable
      if (storage) for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
      Object.defineProperty(w, 'innerWidth', { value: 900, writable: true });
      Object.defineProperty(w, 'innerHeight', { value: 1400, writable: true });
      // every shell asks about aspect ratio and reduced motion; false is fine
      // for both, and the games are portrait-only regardless
      w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
      const noop = () => {};
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.HTMLCanvasElement.prototype.setPointerCapture = noop;
      w.HTMLCanvasElement.prototype.releasePointerCapture = noop;
      /* jsdom lays nothing out, so getBoundingClientRect returns all zeros.
         Every shell converts a pointer position into board coordinates by
         scaling with that rect — `(clientX - left) * (W / rect.width)` — which
         with a zero width yields Infinity and lands nowhere. Reporting the
         canvas's own pixel size makes client coordinates map 1:1 onto board
         coordinates, so a test can click a cell by its board position. */
      w.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
        const width = this.width || 300, height = this.height || 150;
        return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height,
                 width, height, toJSON() { return this; } };
      };
      // let the shell's own loop tick a few times, then stop: the tests drive
      // frames explicitly so timing is theirs, not the scheduler's
      let n = 0;
      w.requestAnimationFrame = cb => { if (n++ < 3) setTimeout(() => cb(n * 16.7), 0); return n; };
      w.onerror = (m, s, l, c, e) => errors.push(String((e && e.stack) || m));
    },
  });

  const w = dom.window;
  return {
    window: w, errors,
    // the node-canvas the shell actually drew on. Exposed so a caller can save
    // a real frame to a PNG — the only reliable way to *look* at the games from
    // here, since a headless browser throttles rAF to the point of not
    // compositing at all. `surface.toBuffer('image/png')`.
    surface,
    get world() { return w.__world; },
    get E() { return w.__E; },
    frame: (t) => w.__frame(t),
    draw: () => w.__draw && w.__draw(),
  };
}

export const wait = (ms) => new Promise(r => setTimeout(r, ms));

/** Boot, let the shell settle, and press Begin. Every game's opening banner has
 *  a `#go` button, and nothing renders in earnest until it is pressed. */
export async function bootAndStart(htmlPath, opts) {
  const g = bootGame(htmlPath, opts);
  await wait(300);
  if (g.errors.length) return g;              // let the caller assert on it
  g.window.document.getElementById('go').click();
  await wait(60);
  return g;
}
