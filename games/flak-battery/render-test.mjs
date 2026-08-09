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
    // per-emplacement since v28 — setting a world-level count would silently
    // draw nothing different
    world.battery.guns[0].barrels = n;
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
  // gun types cost research points now, not scrap
  world.research.points = 1e6;
  for (const type of E.GUN_KEYS) if (type !== 'standard') E.researchGun(world, type);
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
    for (const g2 of world.battery.guns) g2.barrels = barrels;
    for (let i = 0; i < world.battery.guns.length; i++) {
      // the strip leads with the "All" overview tab, so mount i is tab i+1
      doc.querySelectorAll('#shopTabs .tab')[i + 1]?.dispatchEvent(
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

test('the research tab renders alongside the mount tabs and the add slot', async () => {
  const g = await bootAndStart(SHELL);
  const { world, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  world.shopOpen = true;
  g.frame(1000);
  const tabs = doc.querySelectorAll('#shopTabs .tab');
  assert.equal(tabs.length, world.battery.guns.length + 3,
    'the overview, a tab per mount, the add slot, and research');
  tabs[tabs.length - 1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.ok(doc.querySelectorAll('#battery .branch').length > 0, 'the research tab has cards');
  assert.deepEqual(g.errors, [], 'the research tab threw');
});

test('research is bought on the research tab and gates the deep tiers', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  world.shopOpen = true;
  g.frame(1000);

  /* Tier 4 must read as "go and research this", not as "maxed" — those are a
     signpost and a dead end, and the whole feature fails if they look alike. */
  const tabs = () => doc.querySelectorAll('#shopTabs .tab');
  // tab 0 is the emplacement overview the shop now opens on; mount 1 is tab 1
  const renderTab = (i) => tabs()[i + 1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  for (let i = 0; i < E.FREE_TIER; i++) E.buyUpgrade(world, 0, 'damage');
  renderTab(0);
  const branch = [...doc.querySelectorAll('#branches .branch')]
    .find(el => /^Damage$/.test(el.querySelector('h3')?.textContent || ''));
  assert.ok(branch, 'the mount tab shows the Damage branch');
  assert.match(branch.querySelector('button').textContent, /research/i,
    'a gated tier says so rather than claiming to be maxed');

  // now buy the depth on the research tab, through the real button
  world.research.points = 1e6;
  tabs()[tabs().length - 1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const depthCard = [...doc.querySelectorAll('#battery .branch')]
    .find(el => /Damage depth/.test(el.querySelector('h3')?.textContent || ''));
  assert.ok(depthCard, 'the research tab offers branch depth');
  const before = world.research.points;
  depthCard.querySelector('button').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.ok(world.research.points < before, 'it spent research points');
  assert.equal(E.tierCap(world, 'damage'), E.FREE_TIER + 1);

  // and the mount's tab now sells the tier it refused a moment ago
  renderTab(0);
  const again = [...doc.querySelectorAll('#branches .branch')]
    .find(el => /^Damage$/.test(el.querySelector('h3')?.textContent || ''));
  assert.match(again.querySelector('button').textContent, /buy/i, 'tier 4 is for sale now');
  assert.deepEqual(g.errors, [], 'the research tab threw');
});

test('a gun type is learned with research points, not scrap', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  world.shopOpen = true;
  g.frame(1000);

  const tabs = doc.querySelectorAll('#shopTabs .tab');
  tabs[tabs.length - 1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const card = [...doc.querySelectorAll('#battery .branch')]
    .find(el => /Railgun/.test(el.querySelector('h3')?.textContent || ''));
  assert.ok(card, 'the research tab lists the railgun');
  // a pile of scrap must not be enough
  assert.equal(card.querySelector('button').disabled, true, 'scrap does not buy research');

  world.research.points = E.GUN_RP.rail;
  tabs[tabs.length - 1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const live = [...doc.querySelectorAll('#battery .branch')]
    .find(el => /Railgun/.test(el.querySelector('h3')?.textContent || ''));
  live.querySelector('button').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.equal(world.research.guns.rail, true, 'learned');
  assert.equal(world.scrap, 1e6, 'and no scrap was spent');
  assert.deepEqual(g.errors, [], 'researching a gun threw');
});

test('the + tab builds an emplacement and lands you on it', async () => {
  const g = await bootAndStart(SHELL);
  const { world, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  world.shopOpen = true;
  g.frame(1000);
  const before = world.battery.guns.length;

  const add = doc.querySelector('#shopTabs .tab.add');
  assert.ok(add, 'the add slot exists');
  assert.equal(add.disabled, false, 'and is live when it is affordable');
  add.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  assert.equal(world.battery.guns.length, before + 1, 'a mount was built');
  // the new mount's own tab is the one showing, and it arrived bare
  const on = doc.querySelector('#shopTabs .tab.on');
  assert.equal(on.querySelector('b').textContent, String(before + 1),
    'the shop landed on the gun just bought');
  assert.equal(world.battery.guns[before].barrels, 1, 'and it has one barrel of its own');
  assert.deepEqual(g.errors, [], 'buying a mount threw');
});

test('barrels are bought on the mount they belong to', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  E.buyMount(world);
  world.shopOpen = true;
  g.frame(1000);

  // into mount 1's own tab — the shop opens on the overview now
  doc.querySelectorAll('#shopTabs .tab')[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const card = [...doc.querySelectorAll('#branches .branch')]
    .find(el => /Barrels/.test(el.querySelector('h3')?.textContent || ''));
  assert.ok(card, 'the mount tab carries a Barrels card');
  card.querySelector('button').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  assert.equal(world.battery.guns[0].barrels, 2, 'this mount gained a barrel');
  assert.equal(world.battery.guns[1].barrels, 1, 'the other did not');
  assert.deepEqual(g.errors, [], 'buying a barrel threw');
});
