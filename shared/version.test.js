/* Guards the one invariant that spans the app rather than any single game:
   the build string a player can see must match the cache the service worker
   actually serves from.

   This is worth a test rather than a comment because the failure is invisible
   and nasty. `sw.js` is cache-first with no revalidation, so if CACHE_VERSION
   is not bumped, returning players keep the old build forever — and if the
   displayed BUILD *is* bumped while CACHE_VERSION is not, the help panel now
   actively lies about which code is running, which is worse than showing
   nothing at all.

   Runs alongside the engine suites — see the commands in CLAUDE.md, which now
   include this directory as well as games/. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { BUILD, BUILD_LABEL } from './version.js';

const here = dirname(fileURLToPath(import.meta.url));
const swSource = readFileSync(join(here, '..', 'sw.js'), 'utf8');

test('the displayed build matches the service worker cache version', () => {
  const m = swSource.match(/CACHE_VERSION\s*=\s*['"]arcade-([^'"]+)['"]/);
  assert.ok(m, 'sw.js still declares CACHE_VERSION as arcade-<something>');
  assert.equal(
    BUILD, m[1],
    `shared/version.js says "${BUILD}" but sw.js caches "arcade-${m[1]}" — bump both together`
  );
});

test('the build label is something a person can read back to you', () => {
  assert.ok(BUILD.length > 0, 'not empty');
  assert.ok(BUILD_LABEL.includes(BUILD), 'the label contains the build');
  assert.ok(/^Arcade /.test(BUILD_LABEL), 'and names the app');
});
