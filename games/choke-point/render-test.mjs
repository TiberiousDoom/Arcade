/* Draw-path smoke test: boots the real shell against a real canvas and pushes
   every visual state through it. The engine suite proves the *rules*; this
   proves the game can be looked at.

   Needs `npm install --no-save jsdom canvas`.
   Run: node --test games/choke-point/render-test.mjs
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { bootAndStart, wait } from '../../tools/render-harness.mjs';

// fileURLToPath, not .pathname — on Windows the latter yields a leading slash
// and percent-encoded spaces, which fs rejects.
const SHELL = fileURLToPath(new URL('./choke-point.html', import.meta.url));

test('the shell boots without throwing', async () => {
  const g = await bootAndStart(SHELL);
  assert.deepEqual(g.errors, [], 'boot threw');
  assert.ok(g.world, 'the world exists, so the module ran to completion');
});

test('every enemy type renders, slow/heal overlays included', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  // one of everything, half of them slowed and one mid-repair, so the frost
  // overlay and the heal flash both execute (per-trait glyphs were dropped —
  // color and size carry the distinction now, matching the tower art style)
  world.enemies = E.ENEMY_KEYS.map((type, i) => ({
    type, dist: 80 + i * 120, hp: 30, maxhp: 60, speed: 0, r: E.ENEMY_TYPES[type].r,
    slow: i % 2 ? 0.8 : 0, slowStrength: 0.5, healed: i === 0 ? 0.18 : 0,
  }));
  g.frame(1000);
  assert.ok(E.ENEMY_KEYS.length >= 7, `expected the full roster, got ${E.ENEMY_KEYS}`);
  assert.deepEqual(g.errors, [], 'drawing the enemy roster threw');
});

test('every tower type renders across the level range, aiming and firing', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  world.components = 99999;
  // one of each type at a spread of levels, wherever they will fit — level 1,
  // something mid, and the cap, since the pip ring and the stat curve both
  // read off it
  const levels = [1, Math.ceil(E.MAX_LEVEL / 2), E.MAX_LEVEL];
  let placed = 0;
  outer:
  for (let r = 0; r < world.L.ROWS; r++) {
    for (let c = 0; c < world.L.COLS; c++) {
      const type = E.TOWER_KEYS[placed % E.TOWER_KEYS.length];
      if (!E.buildTower(world, c, r, type)) continue;
      const t = world.towers[world.towers.length - 1];
      t.level = levels[placed % levels.length];
      if (++placed >= 9) break outer;
    }
  }
  assert.equal(placed, 9, 'placed a spread of towers');
  // something to shoot at, so beams and barrels are drawn too
  world.enemies = [{ type: 'surge', dist: 60, hp: 500, maxhp: 500, speed: 0, r: 12, slow: 0 }];
  g.frame(1000);
  g.frame(1050);
  assert.deepEqual(g.errors, [], 'drawing towers threw');
});

/* The barrel is a readiness tell now — bare ring when nothing is near, hub and
   barrel once something is. Both states have to survive a draw, and the second
   one only appears after the easing has had frames to run. */
test('towers draw both idle and deployed', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  world.components = 99999;
  let cell = null;
  outer:
  for (let r = 0; r < world.L.ROWS; r++)
    for (let c = 0; c < world.L.COLS; c++)
      if (E.buildTower(world, c, r, 'node')) { cell = { c, r }; break outer; }
  assert.ok(cell, 'built a tower');

  // idle: nothing on the board at all
  world.enemies = [];
  g.frame(1000); g.frame(1100);
  assert.deepEqual(g.errors, [], 'drawing an idle tower threw');

  // deployed: park something on top of it and let the barrel ease out
  const p = E.cellCenter(world.L, cell.c, cell.r);
  let best = 0, bestD = Infinity;
  for (let d = 0; d < world.pathLen; d += 3) {
    const q = E.atS(world.path, world.pathLen, d);
    const dist = Math.hypot(q.x - p.x, q.y - p.y);
    if (dist < bestD) { bestD = dist; best = d; }
  }
  world.enemies = [{ type: 'load', dist: best, hp: 900, maxhp: 900, speed: 0, r: 19, slow: 0 }];
  for (let i = 0; i < 20; i++) g.frame(1200 + i * 40);
  assert.deepEqual(g.errors, [], 'drawing a deployed tower threw');
});

test('the armory opens and renders every class and track', async () => {
  const g = await bootAndStart(SHELL);
  const { world, window: w } = g;
  const doc = w.document;
  world.components = 99999;
  doc.getElementById('shopBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.ok(doc.getElementById('shop').classList.contains('on'), 'the armory opened');
  const buys = doc.querySelectorAll('#shopClasses .armTable button[data-t]');
  assert.equal(buys.length, g.E.TOWER_KEYS.length * g.E.CLASS_TRACKS.length,
    'one cell per class per track');
  /* The grid really is classes across and tracks down. Compared as joined
     strings, not with deepEqual: `g.E`'s arrays are built inside the jsdom VM,
     so they carry *that* realm's Array.prototype and strict deepEqual rejects
     them against an array from this one however identical the contents. */
  assert.equal([...doc.querySelectorAll('#shopClasses .armTable .ch')].map(e => e.textContent).join('|'),
    g.E.TOWER_KEYS.map(k => g.E.TOWER_TYPES[k].name).join('|'), 'tower types are the columns');
  assert.equal(doc.querySelectorAll('#shopClasses .armTable .rh').length,
    g.E.CLASS_TRACKS.length, 'tracks are the rows');
  // every cell carries its price and its five pips
  for (const b of buys) {
    assert.ok(b.querySelector('.px'), 'a cell shows what the next level costs');
    assert.equal(b.querySelectorAll('.pips i').length, g.E.CLASS_MAX, 'and five pips');
  }
  // buying through the real DOM, which is what the shell will actually do
  buys[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const total = Object.values(world.classUpgrades)
    .reduce((n, tracks) => n + Object.values(tracks).reduce((a, b) => a + b, 0), 0);
  assert.equal(total, 1, 'exactly one track went up');
  g.frame(1000);
  assert.deepEqual(g.errors, [], 'the armory threw');
});

/* Two requirements that pull against each other, which is how v31 briefly broke
   one with the other: opening the armory pauses the wave, *and* the armory keeps
   showing live affordability while it is open. Gating the whole frame body —
   `sync()` included — on the shop being closed satisfies the first and silently
   kills the second, so a row you can suddenly afford stays greyed out. Both are
   asserted here, together, because either one alone passes on the broken build. */
test('the armory pauses the wave but keeps repainting affordability', async () => {
  const g = await bootAndStart(SHELL);
  const { world, window: w } = g;
  const doc = w.document;
  const enabled = () => [...doc.querySelectorAll('#shopClasses .armTable button[data-t]')]
    .filter(b => !b.disabled).length;

  world.components = 20;
  g.E.startWave(world);
  for (let i = 0; i < 40; i++) g.frame(1000 + i * 16);
  assert.ok(world.enemies.length > 0, 'a wave is on the board');

  doc.getElementById('shopBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const before = world.enemies.map(e => e.dist);
  const poor = enabled();
  for (let i = 0; i < 40; i++) g.frame(2000 + i * 16);
  assert.equal(world.enemies.map(e => e.dist).join(','), before.join(','),
    'nothing moved while the armory was open');

  // the money changes underneath an open armory — a kill bounty, in play
  world.components = 99999;
  g.frame(3000);
  assert.ok(enabled() > poor, 'newly affordable rows light up without reopening the shop');
  world.components = 0;
  g.frame(3020);
  assert.equal(enabled(), 0, 'and go dark again when the money is spent');

  doc.getElementById('shopClose').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  for (let i = 0; i < 20; i++) g.frame(4000 + i * 16);
  assert.notEqual(world.enemies.map(e => e.dist).join(','), before.join(','),
    'and the wave resumes on close');
  assert.deepEqual(g.errors, [], 'the paused armory threw');
});

/* The exact behavior that got reported: pick a tower, run out of money, and
   v26 would quietly move the highlight to whatever was still affordable — so a
   tap you thought you had made had become a different tap. Selection is yours
   now; being broke only changes how the button looks. */
test('a palette selection survives going broke', async () => {
  const g = await bootAndStart(SHELL);
  const { world, window: w } = g;
  const doc = w.document;
  doc.getElementById('go').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  const picks = [...doc.querySelectorAll('.pick')];
  const breaker = picks.find(b => /breaker/i.test(b.textContent));
  world.components = 9999;
  g.frame(1000);
  breaker.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  assert.ok(breaker.classList.contains('on'), 'picked the breaker');

  // broke: less than the cheapest tower, let alone a Breaker
  world.components = 0;
  g.frame(1050);
  assert.ok(breaker.classList.contains('on'), 'the selection did not wander off');
  assert.ok(breaker.classList.contains('broke'), 'but it reads as unaffordable');
  assert.ok(picks.every(p => !p.disabled), 'and nothing is disabled — you can still choose');

  // and you can still *select* something you cannot yet afford, which is how
  // you pick what to save up for
  const node = picks.find(b => /node/i.test(b.textContent));
  node.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  g.frame(1100);
  assert.ok(node.classList.contains('on'), 'switched to the node while broke');
  assert.deepEqual(g.errors, [], 'the palette threw');
});

test('the tower popup opens and renders on a real DOM', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E, window: w } = g;
  world.components = 9999;
  let built = false;
  for (let r = 0; r < world.L.ROWS && !built; r++)
    for (let c = 0; c < world.L.COLS && !built; c++)
      built = E.buildTower(world, c, r, 'node');
  assert.ok(built);

  const cv = w.document.getElementById('cv');
  const t = world.towers[0];
  const center = E.cellCenter(world.L, t.c, t.r);
  // press *and release*: a press on a tower is ambiguous until it either moves
  // (relocate) or lets go without moving (open the popup)
  cv.dispatchEvent(new w.PointerEvent('pointerdown', {
    clientX: center.x, clientY: center.y, bubbles: true,
  }));
  cv.dispatchEvent(new w.PointerEvent('pointerup', {
    clientX: center.x, clientY: center.y, bubbles: true,
  }));
  await wait(30);
  assert.ok(w.document.getElementById('tsel').classList.contains('on'), 'popup opened');
  assert.deepEqual(g.errors, [], 'opening the popup threw');
});

test('a tower can be dragged to a new cell, and the board draws the pending move', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E, window: w } = g;
  world.components = 9999;

  // build one, and find somewhere legal for it to go
  let from = null;
  for (let r = 0; r < world.L.ROWS && !from; r++)
    for (let c = 0; c < world.L.COLS && !from; c++)
      if (E.buildTower(world, c, r, 'breaker')) from = { c, r };
  assert.ok(from, 'built one to move');

  let to = null;
  for (let r = 0; r < world.L.ROWS && !to; r++)
    for (let c = 0; c < world.L.COLS && !to; c++)
      if (E.canMove(world, 0, c, r)) to = { c, r };
  assert.ok(to, 'somewhere to move it');

  const cv = w.document.getElementById('cv');
  const a = E.cellCenter(world.L, from.c, from.r);
  const b = E.cellCenter(world.L, to.c, to.r);
  const purse = world.components;

  cv.dispatchEvent(new w.PointerEvent('pointerdown', { clientX: a.x, clientY: a.y, bubbles: true }));
  // past DRAG_ARM, so the press arms as a relocation
  w.dispatchEvent(new w.PointerEvent('pointermove', { clientX: b.x, clientY: b.y, bubbles: true }));
  g.frame(1000);                       // draws the move-target overlay
  assert.deepEqual(g.errors, [], 'drawing the pending move threw');

  w.dispatchEvent(new w.PointerEvent('pointerup', { clientX: b.x, clientY: b.y, bubbles: true }));
  await wait(30);

  assert.equal(world.towers[0].c, to.c, 'it landed on the drop cell');
  assert.equal(world.towers[0].r, to.r);
  assert.equal(world.components, purse - E.moveCost(world.towers[0]), 'and paid the fee');
  assert.ok(!w.document.getElementById('tsel').classList.contains('on'),
    'a drag must not leave the popup open behind it');
  assert.deepEqual(g.errors, [], 'the move threw');
});

test('a run through several waves never throws while drawing', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  world.components = 99999;
  let placed = 0;
  outer:
  for (let r = 0; r < world.L.ROWS; r++) {
    for (let c = 0; c < world.L.COLS; c++) {
      if (E.buildTower(world, c, r, E.TOWER_KEYS[placed % 3])) placed++;
      if (placed >= 12) break outer;
    }
  }
  // far enough in that Shell, Phase and Patch are all on the board
  world.wave = E.ENEMY_UNLOCK.patch - 1;
  let t = 1000;
  for (let i = 0; i < 400; i++) {
    if (world.betweenWaves && !world.over) E.startWave(world);
    t += 16.7;
    g.frame(t);
    if (g.errors.length) break;
  }
  assert.ok(world.wave >= E.ENEMY_UNLOCK.patch, `reached wave ${world.wave}`);
  assert.deepEqual(g.errors, [], 'a live run threw while drawing');
});

test('the game-over banner renders', async () => {
  const g = await bootAndStart(SHELL);
  const { world } = g;
  world.integrity = 0;
  world.over = true;
  g.frame(1000);
  assert.deepEqual(g.errors, [], 'drawing a finished game threw');
});
