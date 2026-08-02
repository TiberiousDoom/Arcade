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

test('every tower type and tier renders, aiming and firing', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  world.charge = 99999;
  // one of each type at each tier, wherever they will fit
  let placed = 0;
  outer:
  for (let r = 0; r < world.L.ROWS; r++) {
    for (let c = 0; c < world.L.COLS; c++) {
      const type = E.TOWER_KEYS[placed % E.TOWER_KEYS.length];
      if (!E.buildTower(world, c, r, type)) continue;
      const t = world.towers[world.towers.length - 1];
      t.tier = placed % (E.MAX_TIER + 1);
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

test('the tower popup opens and renders on a real DOM', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E, window: w } = g;
  world.charge = 9999;
  let built = false;
  for (let r = 0; r < world.L.ROWS && !built; r++)
    for (let c = 0; c < world.L.COLS && !built; c++)
      built = E.buildTower(world, c, r, 'node');
  assert.ok(built);

  const cv = w.document.getElementById('cv');
  const t = world.towers[0];
  const centre = E.cellCenter(world.L, t.c, t.r);
  cv.dispatchEvent(new w.PointerEvent('pointerdown', {
    clientX: centre.x, clientY: centre.y, bubbles: true,
  }));
  await wait(30);
  assert.ok(w.document.getElementById('tsel').classList.contains('on'), 'popup opened');
  assert.deepEqual(g.errors, [], 'opening the popup threw');
});

test('a run through several waves never throws while drawing', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  world.charge = 99999;
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
