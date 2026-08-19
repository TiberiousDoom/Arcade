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

/** Open mount `i`'s detail view. The shop opens on the emplacement overview,
 *  whose cards are the gun picker — the per-gun tabs only exist once you are
 *  already looking at a gun. */
function openMount(doc, w, i) {
  const card = doc.querySelectorAll('.empCard')[i];
  if (card) { card.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); return; }
  // already in a detail view: tab 0 is "All", so mount i is tab i+1
  doc.querySelectorAll('#shopTabs .tab')[i + 1]
    ?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
}

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

  const lit = (canvas) => {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let p = 3; p < d.length; p += 4) if (d[p] > 8) n++;
    return n;
  };

  /* The overview's cards carry the same portraits. Their canvases must be the
     drawing's own 420x190 — they were 260x110, which drew the art at full size
     into a smaller bitmap and showed only the top-left corner of each gun. */
  const cards = doc.querySelectorAll('.empCard canvas');
  assert.equal(cards.length, world.battery.guns.length, 'a card per emplacement');
  for (const [i, cv] of [...cards].entries()) {
    /* The canvas must be the drawing's own coordinate space. It was 260x110,
       which drew 420x190 art at full size into a smaller bitmap and showed the
       top-left corner of each gun. The height is the *cropped* 146 now — the
       art only ever occupied the bottom of the 190, and the empty band above it
       was card height for nothing. */
    assert.equal(cv.width, 420, `card ${i} canvas is the portrait's own width`);
    assert.equal(cv.height, 150, `card ${i} canvas is cropped to the art`);
    assert.ok(lit(cv) > 400, `card ${i} portrait is blank (${lit(cv)} px)`);
    // and the art reaches the right-hand side, which is what cropping ate
    const d = cv.getContext('2d').getImageData(cv.width - 60, 0, 60, cv.height).data;
    let right = 0;
    for (let p = 3; p < d.length; p += 4) if (d[p] > 8) right++;
    assert.ok(right > 0, `card ${i} portrait is cut off before its right edge`);
  }

  for (let barrels = 1; barrels <= E.MAX_BARRELS; barrels++) {
    for (const g2 of world.battery.guns) g2.barrels = barrels;
    for (let i = 0; i < world.battery.guns.length; i++) {
      // in a detail view the strip is: All, one per mount, +, Research
      openMount(doc, w, i);
      const canvas = doc.querySelector('#branches .portrait canvas');
      assert.ok(canvas, `mount ${i} rendered no portrait`);
      assert.ok(lit(canvas) > 400,
        `portrait for mount ${i} at ${barrels} barrels is blank (${lit(canvas)} px)`);
    }
    // back to the overview for the next pass
    doc.querySelector('#shopTabs .tab').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
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

/* A world belonging to someone who has finished a run before: past the branch
   ramp, and with research to their name. Tests about the shop's *contents* are
   not tests about the opening ramp, so they say which player they mean —
   the ramp and the hidden Research tab have their own tests below. */
function experienced(g, { points = 1e6 } = {}) {
  g.world.research.best = 99;
  g.world.research.points = points;
  return g;
}

test('the emplacement bar shows how built-out the gun is, not its heat', async () => {
  const g = experienced(await bootAndStart(SHELL));
  const { world, E, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  world.shopOpen = true;

  // heat high, nothing bought: a heat bar would be near full, a depth bar empty
  world.battery.guns[0].heat = 0.9;
  g.frame(1000);
  const bar = () => doc.querySelector('.empCard .empMeta .xpline i')?.style.width;
  assert.equal(bar(), '0%', 'an unbuilt gun reads empty however hot it is');

  // buy into it and the bar has to move
  for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(world, 0, 'damage');
  // the shop rebuilds on interaction, not on a frame — go into the mount and
  // back out to the overview so the card is redrawn
  openMount(doc, w, 0);
  doc.querySelectorAll('#shopTabs .tab')[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const after = parseInt(bar(), 10);
  assert.ok(after > 0, `the bar tracks tiers bought (read ${bar()})`);
  assert.deepEqual(g.errors, [], 'the emplacement card threw');
});

test('a first-run shop opens with three rows, one thermal card, and no Research tab', async () => {
  const g = await bootAndStart(SHELL);
  const { world, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  world.shopOpen = true;
  g.frame(1000);
  openMount(doc, w, 0);

  const names = [...doc.querySelectorAll('#branches .buyRow h3')].map(el => el.textContent);
  assert.deepEqual(names, ['Damage', 'Calibre', 'Cooling'],
    'a new player meets three branches, not nine');

  // Cooling is inside the Thermal card even while it is the only one open
  const group = doc.querySelector('#branches .branchGroup');
  assert.ok(group, 'the thermal card exists');
  assert.match(group.querySelector('.groupName').textContent, /thermal/i);
  assert.deepEqual([...group.querySelectorAll('.buyRow h3')].map(el => el.textContent), ['Cooling']);

  // no second currency on screen before the first one is understood
  const tabs = [...doc.querySelectorAll('#shopTabs .tab')].map(t => t.textContent);
  assert.ok(!tabs.some(t => /research/i.test(t)), 'Research stays hidden on run 1');

  // and the two rules the economy hangs on are stated
  assert.notEqual(doc.getElementById('shopRule').style.display, 'none');
  assert.match(doc.getElementById('shopRule').textContent, /breach ends it/i);
  assert.deepEqual(g.errors, [], 'the opening shop threw');
});

test('the thermal card gathers all three heat branches once they open', async () => {
  const g = experienced(await bootAndStart(SHELL));
  const { world, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  world.shopOpen = true;
  g.frame(1000);
  openMount(doc, w, 0);

  const group = doc.querySelector('#branches .branchGroup');
  assert.deepEqual([...group.querySelectorAll('.buyRow h3')].map(el => el.textContent),
    ['Cooling', 'Breech', 'Interlock'], 'one card, three knobs');

  // exactly one card — the group must not be rebuilt per branch
  assert.equal(doc.querySelectorAll('#branches .branchGroup').length, 1);
  // and the veteran is not told about a ramp they are past
  assert.equal(doc.querySelector('#branches .openingSoon'), null);
  assert.equal(doc.getElementById('shopRule').style.display, 'none',
    'the opening rule is for a first run only');
});

test('the shop names what the next wave opens', async () => {
  const g = await bootAndStart(SHELL);
  const { world, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  world.shopOpen = true;
  g.frame(1000);
  openMount(doc, w, 0);
  const note = doc.querySelector('#branches .openingSoon');
  assert.ok(note, 'a new player is told what is coming');
  assert.match(note.textContent, /Breech and Interlock open at wave 3/);
});

test('a locked branch cannot be bought through the shop', async () => {
  /* The engine refuses it, but the shop must not offer it either — a row that
     renders and then does nothing on tap is worse than no row. */
  const g = await bootAndStart(SHELL);
  const { world, E, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  world.shopOpen = true;
  g.frame(1000);
  openMount(doc, w, 0);
  const names = [...doc.querySelectorAll('#branches .buyRow h3')].map(el => el.textContent);
  assert.ok(!names.includes('Convergence'), 'Convergence is not on the opening shop');
  assert.equal(E.buyUpgrade(world, 0, 'convergence'), false);
});

test('the research tab renders alongside the mount tabs and the add slot', async () => {
  const g = experienced(await bootAndStart(SHELL));
  const { world, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  world.shopOpen = true;
  g.frame(1000);
  /* On the overview the only tab is Research — the gun buttons were a second
     copy of the cards below them. Research is not a gun, so it stays. */
  let tabs = doc.querySelectorAll('#shopTabs .tab');
  assert.equal(tabs.length, 1, 'the overview offers Research and nothing else');
  assert.match(tabs[0].textContent, /research/i);

  tabs[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.ok(doc.querySelectorAll('#battery .branch').length > 0, 'the research tab has cards');

  // in a mount's detail view the gun tabs are back: All, per mount, +, Research
  openMount(doc, w, 0);
  tabs = doc.querySelectorAll('#shopTabs .tab');
  assert.equal(tabs.length, world.battery.guns.length + 3,
    'All, a tab per mount, the add slot, and research');
  assert.deepEqual(g.errors, [], 'the research tab threw');
});

test('research is bought on the research tab and gates the deep tiers', async () => {
  const g = experienced(await bootAndStart(SHELL));
  const { world, E, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  world.shopOpen = true;
  g.frame(1000);

  /* Tier 4 must read as "go and research this", not as "maxed" — those are a
     signpost and a dead end, and the whole feature fails if they look alike. */
  const tabs = () => doc.querySelectorAll('#shopTabs .tab');
  const renderTab = (i) => openMount(doc, w, i);

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
  /* The buy button carries the bare price now rather than "Buy · 142" — nine of
     those rows is a lot of words for nine numbers. So the check is the state,
     not the wording: it must no longer say "Research", and it must be tappable. */
  const buyBtn = again.querySelector('button');
  assert.doesNotMatch(buyBtn.textContent, /research/i, 'no longer gated behind research');
  assert.equal(buyBtn.disabled, false, 'tier 4 is for sale now');
  assert.match(buyBtn.textContent, /\d/, 'and it says what it costs');
  assert.deepEqual(g.errors, [], 'the research tab threw');
});

test('a gun type is learned with research points, not scrap', async () => {
  // experienced enough for the tab to exist, but with nothing banked to spend
  const g = experienced(await bootAndStart(SHELL), { points: 0 });
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

  // the add slot lives in a mount's detail view; the overview offers a card
  openMount(doc, w, 0);
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

  openMount(doc, w, 0);       // the shop opens on the overview; its cards go in
  const card = [...doc.querySelectorAll('#branches .branch')]
    .find(el => /Barrels/.test(el.querySelector('h3')?.textContent || ''));
  assert.ok(card, 'the mount tab carries a Barrels card');
  card.querySelector('button').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  assert.equal(world.battery.guns[0].barrels, 2, 'this mount gained a barrel');
  assert.equal(world.battery.guns[1].barrels, 1, 'the other did not');
  assert.deepEqual(g.errors, [], 'buying a barrel threw');
});

test('leaving the shop does not require scrolling past the tree', async () => {
  /* The button used to be the last child of the scrolling panel, below nine
     branch rows — so "Next Wave" was the one control you always want and the
     one you had to go looking for. It shares the tabs' sticky bar now. */
  const g = await bootAndStart(SHELL);
  const { world, window: w } = g;
  const doc = w.document;
  world.shopOpen = true;
  g.frame(1000);

  const go = doc.getElementById('shopGo');
  const bar = doc.getElementById('shopBar');
  assert.ok(bar, 'the shop has a sticky bar');
  assert.ok(bar.contains(go), 'and Next Wave lives in it');
  assert.ok(bar.contains(doc.getElementById('shopTabs')), 'alongside the tabs');
  // one sticky element, not two competing for the same top edge
  assert.equal(w.getComputedStyle(bar).position, 'sticky');
  assert.notEqual(w.getComputedStyle(doc.getElementById('shopTabs')).position, 'sticky');
  assert.deepEqual(g.errors, [], 'the shop bar threw');
});

test('a mount shows its resolved stats in two columns', async () => {
  const g = await bootAndStart(SHELL);
  const { world, window: w } = g;
  const doc = w.document;
  world.shopOpen = true;
  g.frame(1000);
  openMount(doc, w, 0);

  const dl = doc.querySelector('#branches .statBlock dl');
  assert.ok(dl, 'the mount tab carries a stat block');
  assert.equal(w.getComputedStyle(dl).gridTemplateColumns, '1fr 1fr', 'exactly two columns');
  const stats = [...dl.querySelectorAll('.stat')];
  assert.ok(stats.length >= 9, 'and the stats are in it');
  // every pair is one cell, so a label can never land in a different column
  // from its own number
  for (const s of stats) {
    assert.ok(s.querySelector('dt') && s.querySelector('dd'), 'label and value travel together');
  }
  assert.deepEqual(g.errors, [], 'the stat block threw');
});

test('buying an upgrade flashes the stat it moved', async () => {
  /* Nine numbers in a block and one of them ticking over is invisible. The
     subtree is fully rebuilt on a purchase, so this also pins that the flash
     lands on the *new* node rather than one that no longer exists. */
  const g = await bootAndStart(SHELL);
  const { world, E, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  world.shopOpen = true;
  g.frame(1000);
  openMount(doc, w, 0);

  const row = [...doc.querySelectorAll('#branches .branch')]
    .find(el => /^Damage$/.test(el.querySelector('h3')?.textContent || ''));
  assert.ok(row, 'the Damage row is there');
  row.querySelector('button').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.equal(world.battery.guns[0].upgrades.damage, 1, 'the tier was bought');

  const lit = [...doc.querySelectorAll('#branches .statBlock .stat.bought')];
  assert.equal(lit.length, 1, 'exactly one stat is highlighted');
  assert.equal(lit[0].dataset.stat, 'damage', 'and it is the one that moved');
  assert.deepEqual(g.errors, [], 'the buy flash threw');
});

test('every branch in the tree points at a stat the block shows', async () => {
  // a branch whose data-stat matches nothing would flash nothing on purchase,
  // silently, which is exactly the failure this whole feature exists to fix
  const g = await bootAndStart(SHELL);
  const { world, window: w } = g;
  const doc = w.document;
  world.shopOpen = true;
  g.frame(1000);
  openMount(doc, w, 0);

  const shown = new Set([...doc.querySelectorAll('#branches .statBlock .stat')]
    .map(el => el.dataset.stat).filter(Boolean));
  for (const b of g.E.BRANCHES) {
    assert.ok(shown.has(b), `${b} moves a stat the block displays`);
  }
});

test('a buy row previews what the next tier is worth, and stops at the top', async () => {
  const g = experienced(await bootAndStart(SHELL));
  const { world, E, window: w } = g;
  const doc = w.document;
  world.scrap = 1e6;
  world.shopOpen = true;
  g.frame(1000);
  openMount(doc, w, 0);

  const rowFor = (name) => [...doc.querySelectorAll('#branches .branch')]
    .find(el => el.querySelector('h3')?.textContent === name);

  /* The numbers come off UPGRADES rather than being restated in the shell, so
     the assertion is that the row shows *this branch's* tier values — a row
     wired to the wrong branch would still render something plausible. */
  const damage = rowFor('Damage');
  const [t0, t1] = [E.UPGRADES.damage.tiers[0].dmg, E.UPGRADES.damage.tiers[1].dmg];
  const text = damage.querySelector('.preview').textContent.replace(/\s+/g, ' ');
  assert.match(text, new RegExp(`Damage ${t0} → ${t1}`),
    `the Damage row previews ${t0} → ${t1}`);

  // Munitions moves two stats — the documented exception — and must show both
  const munitions = rowFor('Munitions').querySelector('.preview').textContent;
  assert.match(munitions, /Pierce/, 'Munitions previews pierce');
  assert.match(munitions, /Bounces/, 'Munitions previews bounces');

  // at the top of a branch there is no next tier, so there is nothing to promise
  for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(world, 0, 'damage');
  openMount(doc, w, 0);
  assert.equal(rowFor('Damage').querySelector('.preview'), null,
    'a maxed branch previews nothing rather than repeating its last tier');
  assert.deepEqual(g.errors, [], 'the buy-row preview threw');
});
