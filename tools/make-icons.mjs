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
const SCALE = '#3fae8f';
const SCALE_LIT = '#5fc9a4';
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

/** One invader: a square face with a lit top edge, so it reads as a cube at a
 *  glance. The repo's one absolute art rule — invaders are cubes, defenders
 *  are spheres — is what makes the mark legible once it is 32px wide. */
function cube(ctx, x, y, s, face) {
  ctx.fillStyle = face;
  ctx.fillRect(x, y, s, s);
  ctx.fillStyle = SCALE_LIT;
  ctx.fillRect(x, y, s, s * 0.22);
}

/** The mark, drawn in a 100x100 space: a chain of cubes overhead, a round in
 *  flight, and the gun below with its barrel up. Flak Battery is the flagship
 *  of the invasion cabinet, so it is the mark the whole app installs under. */
function drawMark(ctx) {
  const s = 19, gap = 6, cols = 3;
  const x0 = (100 - (cols * s + (cols - 1) * gap)) / 2;
  for (let c = 0; c < cols; c++) {
    // the middle of a chain carries the armoured head — brass, so the row is
    // never three identical blocks
    cube(ctx, x0 + c * (s + gap), 12, s, c === 1 ? BRASS : SCALE);
  }

  // the gun: a barrel elevated at the chain on a low mount. Drawn tilted and
  // long — upright and stubby it read as a chess pawn rather than a cannon.
  const ang = -0.42;
  ctx.save();
  ctx.translate(46, 82);
  ctx.rotate(ang);
  ctx.fillStyle = BONE;
  roundRect(ctx, -6, -36, 12, 38, 5);
  ctx.fillStyle = BRASS;
  roundRect(ctx, -7.5, -37, 15, 7, 3);   // muzzle brake, so the end reads
  ctx.restore();

  ctx.fillStyle = BRASS;
  roundRect(ctx, 25, 80, 46, 12, 6);     // the mount it stands on
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(46, 82, 6, 0, Math.PI * 2);    // trunnion
  ctx.fill();

  // the round, already away and climbing along the barrel's line
  const mx = 46 + Math.sin(-ang) * 50, my = 82 - Math.cos(ang) * 50;
  ctx.fillStyle = BONE;
  ctx.beginPath();
  ctx.arc(mx, my, 5, 0, Math.PI * 2);
  ctx.fill();
}

/** @param scale fraction of the canvas the mark occupies. Maskable icons need
 *  their content inside the center ~80%, since launchers crop the rest. */
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
