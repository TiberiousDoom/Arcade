/* Build the gun bench: docs/art/gun-bench.html.

   A review page for the shop gun portraits — the five guns drawn live, with
   elevation, barrel-count and exposure controls. It exists because the render
   harness cannot judge this art: it is dark body fills under additive glow,
   which node-canvas renders far dimmer than a GPU, so a faithful capture is
   unreadable and an "is there ink here" assertion answers yes wherever it is
   pointed. Two such assertions once passed with a gun lying flat.

   **Generated, never hand-edited.** Everything it draws is lifted verbatim from
   the repo at build time — `shared/glow.js`, the engine's GUN_TYPES and
   BARREL_OFFSETS, and the shell's `drawCannonPortrait` — so a bench built from
   a clean tree cannot drift from the game. That is the whole point: the first
   version of this page was a hand-kept copy, which is the same staleness trap
   the standalone build was retired for.

   Run after changing any gun art:

     node tools/gun-bench.mjs

   The page needs no server; open docs/art/gun-bench.html directly. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const strip = (s) => s.replace(/^export /gm, '');

/** Take a top-level `const NAME = ...;` through its closing line. */
function constBlock(src, name, close = '\n};\n') {
  const i = src.indexOf(`export const ${name}`);
  if (i < 0) throw new Error(`missing ${name}`);
  const j = src.indexOf(close, i) + close.length;
  return src.slice(i, j).replace('export ', '');
}

const glow = strip(read('shared/glow.js'));
const engine = read('games/flak-battery/engine.js');
const gunTypes = constBlock(engine, 'GUN_TYPES');
const offsets = /^export (const BARREL_OFFSETS = [^\n]+)$/m.exec(engine)[1];

const shell = read('games/flak-battery/flak-battery.html');
const artStart = shell.indexOf('const PORTRAIT_W = ');
const artEnd = shell.indexOf('\n}\n', shell.indexOf('function drawCannonPortrait')) + 3;
if (artStart < 0 || artEnd < 3) throw new Error('could not find the portrait code in the shell');
// the bench drives elevation from a slider, so this one constant is mutable here
const art = shell.slice(artStart, artEnd).replace('const PORTRAIT_ANGLE =', 'let PORTRAIT_ANGLE =');

const build = /BUILD = '([^']+)'/.exec(read('shared/version.js'))[1];

const bundle = [
  '/* Lifted verbatim from the repo at build time — see tools/gun-bench.mjs. */',
  'const TAU = Math.PI * 2;',
  glow, gunTypes, offsets + ';',
  'const E = { GUN_TYPES, BARREL_OFFSETS };',
  art,
].join('\n\n');

const page = read('tools/gun-bench.template.html')
  .replace('/*__ART__*/', () => bundle)
  .replace(/__BUILD__/g, build);

mkdirSync(join(root, 'docs/art'), { recursive: true });
writeFileSync(join(root, 'docs/art/gun-bench.html'), page);
console.log(`wrote docs/art/gun-bench.html (${build}, ${page.length} bytes)`);
