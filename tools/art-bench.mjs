/* Build a game's art bench: docs/art/<game>-bench.html.

     node tools/art-bench.mjs airburst
     node tools/art-bench.mjs shield-wall

   A review page for a game's art in a real browser on a real GPU — the only
   place it can be judged. The render harness draws through node-canvas, which
   renders additive glow far dimmer than a phone does; Airburst's first art
   was reviewed only that way, and its polish pass is where this came from.

   **Generated, never hand-edited** — the gun bench's rule. Everything it draws
   is lifted verbatim at build time: every export of `shared/glow.js` and
   `shared/fx.js`, the game's whole engine (as `E`), and the shell's art
   section, from its `art (lifted verbatim …)` marker to its `end art` marker.
   The page around it is `tools/<game>-bench.template.html`, which holds the
   staging, the controls and the preamble that defines the names the art
   section expects (each game's notes list them). Its `__LIBS__` comment marker
   receives the libraries and its `__ART__` marker the art.

   The page needs no server, but it does need to run scripts: open it in a
   browser, from the Pages site, or publish it as an artifact. The Claude app's
   file preview does not run them. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const game = process.argv[2];
if (!game || !existsSync(join(root, 'tools', `${game}-bench.template.html`))) {
  console.error('usage: node tools/art-bench.mjs <game>   (needs tools/<game>-bench.template.html)');
  process.exit(1);
}

/** A module with `export` stripped, in its own scope, returning every name it
 *  exported — so modules that each define TAU or clamp cannot collide. */
function scoped(src) {
  const names = [...src.matchAll(/^export (?:const|function|let) (\w+)/gm)].map(m => m[1]);
  return { names, code: `(() => {\n${src.replace(/^export /gm, '')}\nreturn { ${names.join(', ')} };\n})()` };
}

const shell = read(`games/${game}/${game}.html`);
const start = shell.indexOf('/* ---------- art (lifted verbatim');
const end = shell.indexOf('/* ---------- end art ---------- */');
if (start < 0 || end < 0) throw new Error(`could not find the art markers in games/${game}/${game}.html`);

const glow = scoped(read('shared/glow.js'));
const fx = scoped(read('shared/fx.js'));
const engine = scoped(read(`games/${game}/engine.js`));
const build = /BUILD = '([^']+)'/.exec(read('shared/version.js'))[1];

const libs = [
  `/* Lifted verbatim from the repo at build time — see tools/art-bench.mjs. */`,
  `const { ${glow.names.join(', ')} } = ${glow.code};`,
  `const { ${fx.names.join(', ')} } = ${fx.code};`,
  `const E = ${engine.code};`,
].join('\n\n');

const page = read(`tools/${game}-bench.template.html`)
  .replace('/*__LIBS__*/', () => libs)
  .replace('/*__ART__*/', () => shell.slice(start, end))
  .replace(/__BUILD__/g, build);

mkdirSync(join(root, 'docs/art'), { recursive: true });
writeFileSync(join(root, `docs/art/${game}-bench.html`), page);
console.log(`wrote docs/art/${game}-bench.html (${build}, ${page.length} bytes)`);
