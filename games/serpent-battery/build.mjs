/* Generates serpent-battery-standalone.html — a single portable file with the
   engine, the shared modules, and the shared stylesheet all inlined.

   The inlining itself lives in tools/inline.mjs, shared with the render tests.
   This script is just "write that result to disk", because the standalone is a
   distribution artifact: a genuinely single file you can hand someone, which
   loads with zero subresource requests.

   Serpent Battery is the only game with one. The other three get render tests
   by inlining in memory instead, which is the same safety net without a
   checked-in file to keep in sync.

   Run:  node games/serpent-battery/build.mjs
*/
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inlineGame } from '../../tools/inline.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const html = inlineGame(join(here, 'serpent-battery.html'));
writeFileSync(join(here, 'serpent-battery-standalone.html'), html);
console.log('wrote serpent-battery-standalone.html');
