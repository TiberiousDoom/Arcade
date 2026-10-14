/* Build the Airburst art bench: docs/art/airburst-bench.html.

   A review page for Airburst's art, in a real browser on a real GPU — which is
   the only place it can be judged. The render harness draws through
   node-canvas, which renders additive glow far dimmer than a phone does, and
   the polish pass found that the first version of this game's art had been
   reviewed only that way. This page shows two things: a *staged* sky with
   every element in every state at once (warheads at several angles, the
   split warning at two strengths, bursts growing / holding / fading,
   interceptors, lost cities, a dead battery, the touch crosshair), and a
   *live* run of the real engine at a chosen wave, with a bot firing.

   **Generated, never hand-edited** — the gun bench's rule. Everything it draws
   is lifted verbatim at build time: `shared/glow.js`, `shared/fx.js`, the
   whole Airburst engine, and the shell's art section, which runs from the
   `art (lifted verbatim …)` marker to the `end art` marker in airburst.html.

   Run after changing any Airburst art:

     node tools/airburst-bench.mjs

   The page needs no server; open docs/art/airburst-bench.html directly. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** A module's source with `export` stripped, inside its own scope, returning
 *  every name it exported — so modules that each define TAU or clamp cannot
 *  collide. */
function scoped(src) {
  const names = [...src.matchAll(/^export (?:const|function|let) (\w+)/gm)].map(m => m[1]);
  return `(() => {\n${src.replace(/^export /gm, '')}\nreturn { ${names.join(', ')} };\n})()`;
}

const shell = read('games/airburst/airburst.html');
const start = shell.indexOf('/* ---------- art (lifted verbatim');
const end = shell.indexOf('/* ---------- end art ---------- */');
if (start < 0 || end < 0) throw new Error('could not find the art markers in airburst.html');
const art = shell.slice(start, end);

const build = /BUILD = '([^']+)'/.exec(read('shared/version.js'))[1];

const bundle = [
  '/* Lifted verbatim from the repo at build time — see tools/airburst-bench.mjs. */',
  `const { glowStroke, glowDot, inkDot, cube, GLOW_PASSES_CHEAP, DOT_PASSES_CHEAP } = ${scoped(read('shared/glow.js'))};`,
  `const { makeFx } = ${scoped(read('shared/fx.js'))};`,
  `const E = ${scoped(read('games/airburst/engine.js'))};`,
  '/* The names the art section expects to find. */',
  "const cv = document.getElementById('cv'), ctx = cv.getContext('2d');",
  'const TAU = E.TAU, L = E.LAYOUT, W = L.W, H = L.H;',
  'const reduce = false;',
  'const prefs = { shake: 0 };',
  'const gfx = makeFx({ reduce: false });',
  'let world = E.createWorld({ seed: 1 });',
  'let aim = null;',
  art,
].join('\n\n');

const page = read('tools/airburst-bench.template.html')
  .replace('/*__ART__*/', () => bundle)
  .replace(/__BUILD__/g, build);

mkdirSync(join(root, 'docs/art'), { recursive: true });
writeFileSync(join(root, 'docs/art/airburst-bench.html'), page);
console.log(`wrote docs/art/airburst-bench.html (${build}, ${page.length} bytes)`);
