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
  // colour and size carry the distinction now, matching the tower art style)
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

test('the armoury opens and renders every class and track', async () => {
  const g = await bootAndStart(SHELL);
  const { world, window: w } = g;
  const doc = w.document;
  world.components = 99999;
  doc.getElementById('shopBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.ok(doc.getElementById('shop').classList.contains('on'), 'the armoury opened');
  const buys = doc.querySelectorAll('#shopClasses button[data-t]');
  assert.ok(buys.length >= 9, `expected a buy button per class per track, got ${buys.length}`);
  // buying through the real DOM, which is what the shell will actually do
  buys[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const total = Object.values(world.classUpgrades)
    .reduce((n, tracks) => n + Object.values(tracks).reduce((a, b) => a + b, 0), 0);
  assert.equal(total, 1, 'exactly one track went up');
  g.frame(1000);
  assert.deepEqual(g.errors, [], 'the armoury threw');
});

/* The exact behaviour that got reported: pick a tower, run out of money, and
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
  const centre = E.cellCenter(world.L, t.c, t.r);
  // press *and release*: a press on a tower is ambiguous until it either moves
  // (relocate) or lets go without moving (open the popup)
  cv.dispatchEvent(new w.PointerEvent('pointerdown', {
    clientX: centre.x, clientY: centre.y, bubbles: true,
  }));
  cv.dispatchEvent(new w.PointerEvent('pointerup', {
    clientX: centre.x, clientY: centre.y, bubbles: true,
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
