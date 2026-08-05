/* Draw-path smoke test: boots the real shell against a real canvas and pushes
   every visual state through it. The engine suite proves the *rules*; this
   proves the game can be looked at.

   Boots `flak-battery.html` directly via the shared harness, which inlines the
   import graph in memory — the same way the other three games' render tests
   work. This used to boot a checked-in `flak-battery-standalone.html`, an early
   single-file distribution experiment that has since been retired; a generated
   artifact that had to be regenerated after every change was a standing trap
   (a stale one meant this test was silently checking old code).

   Needs `npm install --no-save jsdom canvas`.
   Run: node --test games/flak-battery/render-test.mjs
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { bootAndStart } from '../../tools/render-harness.mjs';

// fileURLToPath, not .pathname — on Windows the latter yields a leading slash
// and percent-encoded spaces, which fs rejects.
const SHELL = fileURLToPath(new URL('./flak-battery.html', import.meta.url));

test('the shell boots without throwing', async () => {
  const g = await bootAndStart(SHELL);
  assert.deepEqual(g.errors, [], 'boot threw');
  assert.ok(g.world, 'the world exists, so the module ran to completion');
});

test('every segment type renders on a real canvas without throwing', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  // late enough that every kind is unlocked. Was hardcoded to 6, which after
  // KIND_UNLOCK landed exactly on the >= 6 threshold by luck — one more unlock
  // moving and it would have started failing for no real reason.
  world.wave = Math.max(...Object.values(E.KIND_UNLOCK));
  E.spawnWave(world);
  world.chains[0].s = 1400;
  const kinds = new Set(world.chains[0].segs.map(s => s.kind));
  g.frame(1000);
  const expected = Object.keys(E.KIND_UNLOCK).length + 1;   // + the head
  assert.equal(kinds.size, expected, `expected every segment type, got ${[...kinds]}`);
  assert.deepEqual(g.errors, [], 'render threw');
});

test('the full battery with gun types renders without throwing', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  world.scrap = 1e6;
  world.battery.guns.push(E.makeGun(world.L.W * 0.32));
  world.battery.guns.push(E.makeGun(world.L.W * 0.68));
  world.gunUnlocks.rail = true;
  world.gunUnlocks.ion = true;
  E.setGunType(world, 1, 'rail');
  E.setGunType(world, 2, 'ion');
  world.battery.guns[0].heat = 0.7;
  E.spawnPickup(world, 440, 380, 'spread');
  world.shake = 0.5;
  g.frame(1000);
  assert.deepEqual(g.errors, [], 'render threw with guns, pickup, shake');
});

test('every barrel count draws, including the flanking pair', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  let t = 1000;
  for (let n = 1; n <= E.MAX_BARRELS; n++) {
    world.barrels = n;
    world.battery.guns[0].locked = n === E.MAX_BARRELS ? 0.5 : 0;   // locked art too
    g.frame(t += 20);
  }
  assert.deepEqual(g.errors, [], 'drawing multi-barrel mounts threw');
});

/* The five cannon portraits are the largest piece of new art in the shop and
   the least likely to be looked at during a normal test run — a broken one
   would sit there for a version. Each is driven at least once here, at every
   barrel count, and the canvas is checked to have actually been marked. */
test('every cannon portrait draws something', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  for (const type of E.GUN_KEYS) if (type !== 'standard') E.unlockGun(world, type);
  // a mount per type, so every tab exists at once
  while (world.battery.guns.length < E.GUN_KEYS.length && E.buyMount(world));
  E.GUN_KEYS.forEach((type, i) => {
    if (world.battery.guns[i]) E.setGunType(world, i, type, true);
  });

  // the frame loop is what opens the shop when the engine asks for it
  world.shopOpen = true;
  g.frame(1000);
  assert.ok(doc.getElementById('shop').classList.contains('on'), 'the shop opened');

  for (let barrels = 1; barrels <= E.MAX_BARRELS; barrels++) {
    world.barrels = barrels;
    for (let i = 0; i < world.battery.guns.length; i++) {
      doc.querySelectorAll('#shopTabs .tab')[i]?.dispatchEvent(
        new w.MouseEvent('click', { bubbles: true }));
      const canvas = doc.querySelector('#branches .portrait canvas');
      assert.ok(canvas, `tab ${i} rendered no portrait`);
      const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let lit = 0;
      for (let p = 3; p < d.length; p += 4) if (d[p] > 8) lit++;
      assert.ok(lit > 400, `portrait for mount ${i} at ${barrels} barrels is blank (${lit} px)`);
    }
  }
  assert.deepEqual(g.errors, [], 'drawing the portraits threw');
});

/* The two-mode aiming split. Below the breach line a touch drags relatively;
   above it the guns point where the finger is. Driven through real pointer
   events on the canvas, because the whole rule lives in those handlers. */
test('a touch above the breach line aims at the finger, below it drags', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E, window: w } = g;
  const cv = w.document.getElementById('cv');
  const rect = cv.getBoundingClientRect();
  const toClient = (x, y) => ({
    clientX: rect.left + (x / world.L.W) * rect.width,
    clientY: rect.top + (y / world.L.H) * rect.height,
  });
  const touch = (x, y, type = 'pointerdown') => {
    const p = toClient(x, y);
    cv.dispatchEvent(new w.PointerEvent(type, {
      ...p, bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1, isPrimary: true,
    }));
  };

  // well above the floor, off to the left — the battery should swing that way
  world.cannon.ang = E.AIM_MAX;                 // start hard over to the right
  touch(60, world.L.FLOOR - 300);
  for (let i = 0; i < 40; i++) g.frame(1000 + i * 16);
  const aimedLeft = world.cannon.ang;
  assert.ok(aimedLeft < E.AIM_MAX - 0.2,
    `pointing at the top-left should swing the battery left (ang ${aimedLeft})`);

  touch(60, world.L.FLOOR - 300, 'pointerup');

  // now below the floor: a press there must not jump the aim to that point
  const before = world.cannon.ang;
  touch(world.L.W - 40, world.L.FLOOR + 60);
  g.frame(2000);
  assert.ok(Math.abs(world.cannon.ang - before) < 0.05,
    'a press in the thumb band did not teleport the aim');
  touch(world.L.W - 40, world.L.FLOOR + 60, 'pointerup');

  assert.deepEqual(g.errors, [], 'aiming threw');
});

test('the battery tab renders alongside the mount tabs', async () => {
  const g = await bootAndStart(SHELL);
  const { world, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  world.shopOpen = true;
  g.frame(1000);
  const tabs = doc.querySelectorAll('#shopTabs .tab');
  assert.equal(tabs.length, world.battery.guns.length + 1, 'a tab per mount plus the battery');
  tabs[tabs.length - 1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.ok(doc.querySelectorAll('#battery .branch').length > 0, 'the battery tab has cards');
  assert.deepEqual(g.errors, [], 'the battery tab threw');
});
