/* Generates the PWA icon set into shared/icons/.
   Run: node tools/make-icons.mjs   (needs `npm install --no-save canvas`)

   The icons are committed, so this only needs re-running when the mark itself
   changes. Kept as a script rather than hand-drawn files so the mark stays
   consistent across sizes and can be re-cut for a new size in one line. */
import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'icons');
mkdirSync(out, { recursive: true });

const VOID = '#0b1418';
const ROWS = ['#c9a227', '#3fae8f', '#5fc9a4'];
const BONE = '#e6e9e2';
const BRASS = '#c9a227';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

/** The mark, drawn in a 100x100 space: a brick field, a ball, and a paddle.
 *  Reads as "arcade" at a glance and survives being shrunk to a favicon. */
function drawMark(ctx) {
  const cols = 4, bw = 20, bh = 6, gap = 2;
  const total = cols * bw + (cols - 1) * gap;
  const x0 = (100 - total) / 2;
  for (let r = 0; r < ROWS.length; r++) {
    ctx.fillStyle = ROWS[r];
    for (let c = 0; c < cols; c++) {
      roundRect(ctx, x0 + c * (bw + gap), 18 + r * (bh + gap), bw, bh, 1.5);
    }
  }
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(50, 60, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = BRASS;
  roundRect(ctx, 30, 76, 40, 8, 4);
}

/** @param scale fraction of the canvas the mark occupies. Maskable icons need
 *  their content inside the centre ~80%, since launchers crop the rest. */
function render(size, scale) {
  const cv = createCanvas(size, size);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = VOID;
  ctx.fillRect(0, 0, size, size);

  const art = size * scale;
  ctx.translate((size - art) / 2, (size - art) / 2);
  ctx.scale(art / 100, art / 100);
  drawMark(ctx);
  return cv.toBuffer('image/png');
}

const targets = [
  ['icon-192.png', 192, 0.78],
  ['icon-512.png', 512, 0.78],
  ['icon-maskable-512.png', 512, 0.56],   // extra padding for launcher masks
  ['apple-touch-icon.png', 180, 0.72],    // iOS applies its own rounding
  ['favicon-32.png', 32, 0.88],
];

for (const [name, size, scale] of targets) {
  writeFileSync(join(out, name), render(size, scale));
  console.log('wrote', name, `${size}x${size}`);
}
