/* Render a real frame of a game to a PNG.

   Exists because looking at the games is otherwise hard from a headless
   environment: a background browser throttles requestAnimationFrame so hard it
   stops compositing altogether, so screenshots come back blank and any
   judgement about how something *looks* is worthless. Booting the real shell
   against node-canvas and driving frames by hand gives an honest picture.

   Mostly useful for art work, and for putting a current screenshot in a doc.

   Needs `npm install --no-save jsdom canvas`.

     node tools/screenshot.mjs games/feedline/feedline.html out.png
     node tools/screenshot.mjs games/feedline/feedline.html out.png --frames 400

   Options:
     --frames N   how many frames to drive before capturing (default 240)
     --width N    backing canvas width  (default 460)
     --height N   backing canvas height (default 820)
     --no-start   skip pressing Begin, to capture the opening banner
     --grow N     Feedline only: pad the wire out, so the art can be judged on
                  a long one rather than the four cells it starts with
*/
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bootGame, bootAndStart } from './render-harness.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const [shell, out] = argv.filter(a => !a.startsWith('--') &&
  argv[argv.indexOf(a) - 1]?.startsWith('--') !== true);

if (!shell || !out) {
  console.error('usage: node tools/screenshot.mjs <game.html> <out.png> [--frames N]');
  process.exit(1);
}

const width = Number(flag('width', 460));
const height = Number(flag('height', 820));
const frames = Number(flag('frames', 240));
const start = !argv.includes('--no-start');

const g = start
  ? await bootAndStart(resolve(shell), { width, height })
  : bootGame(resolve(shell), { width, height });

if (!start) await new Promise(r => setTimeout(r, 300));

const grow = Number(flag('grow', 0));
if (grow && g.world && 'grow' in g.world) g.world.grow = grow;

let t = 1000;
for (let i = 0; i < frames; i++) { t += 1000 / 60; g.frame(t); }

/* Composite onto the board color before saving. Most shells clear to
   transparent and let the page background show through, so a raw capture has an
   alpha channel — which renders as WHITE in most viewers and makes a dark game
   look like a blown-out negative. Feedline happens to escape this because its
   phosphor fade paints an opaque background every frame.

   Painted *underneath* with `destination-over` rather than onto a second
   canvas, which also sidesteps `drawImage` rejecting a canvas that came from a
   different copy of the node-canvas module. */
const bg = flag('bg', '#0b1418');
const sctx = g.surface.getContext('2d');
sctx.save();
sctx.globalCompositeOperation = 'destination-over';
sctx.fillStyle = bg;
sctx.fillRect(0, 0, width, height);
sctx.restore();

writeFileSync(resolve(out), g.surface.toBuffer('image/png'));
console.log(`wrote ${out} (${width}x${height}, ${frames} frames)` +
  (g.errors.length ? ` — ${g.errors.length} error(s): ${g.errors[0]}` : ''));
