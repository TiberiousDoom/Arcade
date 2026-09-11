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

/* A player who has held a circuit on all three difficulties — so Sever, Chain
   and Veterancy are all earned. Passed as stored progress, which is how the
   shell really learns it: `progress` is read from localStorage at boot and
   projected onto the world by `syncUnlocks`. */
const SWEPT = JSON.stringify({ wins: { easy: [0], medium: [0], hard: [0] } });
const swept = (opts = {}) =>
  ({ ...opts, storage: { 'arcade:choke-point:progress': SWEPT, ...(opts.storage || {}) } });

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
  // swept, so the earned class is on the board too — an unbuildable class draws
  // nothing, and a draw test that quietly skipped one would prove nothing
  const g = await bootAndStart(SHELL, swept());
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
  const g = await bootAndStart(SHELL, swept());
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

test('the palette quotes the price the board is actually charging', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E, window: w } = g;
  const doc = w.document;
  world.components = 99999;
  g.frame(1000);
  const nodePick = [...doc.querySelectorAll('.pick')].find(b => /node/i.test(b.textContent));
  const price = () => Number(nodePick.querySelector('.cost').textContent);
  assert.equal(price(), E.TOWER_TYPES.node.cost, 'the first one is the list price');

  let placed = 0;
  outer:
  for (let r = 0; r < world.L.ROWS; r++)
    for (let c = 0; c < world.L.COLS; c++) {
      if (E.buildTower(world, c, r, 'node') && ++placed >= 8) break outer;
    }
  assert.equal(placed, 8);
  g.frame(1050);
  assert.equal(price(), E.buildCost(world, 'node'), 'and it tracks the crowding premium');
  assert.ok(price() > E.TOWER_TYPES.node.cost, 'which is dearer than the list price');
  assert.deepEqual(g.errors, [], 'the palette threw');
});

test('rush latches down, and lets go when the wave has finished arriving', async () => {
  const g = await bootAndStart(SHELL);
  const { world, window: w } = g;
  const doc = w.document;
  const rush = doc.getElementById('rushWave');
  g.frame(1000);
  assert.ok(rush.disabled, 'nothing to rush before a wave starts');

  doc.getElementById('startWave').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  g.frame(1050);
  assert.ok(!rush.disabled, 'a wave is arriving, so it can be hurried');
  rush.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  g.frame(1100);
  assert.ok(world.rushing, 'the engine latched');
  assert.ok(rush.classList.contains('on'), 'and the button is visibly down');
  assert.equal(rush.getAttribute('aria-pressed'), 'true');

  // pressed again, it lets go early
  rush.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  g.frame(1150);
  assert.equal(world.rushing, false, 'turned off early');
  assert.ok(!rush.classList.contains('on'));

  // left on, it releases itself once the queue is empty
  rush.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.ok(world.rushing);
  let t = 1200;
  for (let i = 0; i < 4000 && world.spawnQueue.length; i++) g.frame(t += 16);
  g.frame(t += 16);
  assert.equal(world.spawnQueue.length, 0, 'the wave finished arriving');
  assert.ok(!rush.classList.contains('on'), 'and the latch came back up');
  assert.deepEqual(g.errors, [], 'the wave row threw');
});

test("a breaker's round is drawn while it flies, and only then does it land", async () => {
  const g = await bootAndStart(SHELL);
  const { world, E } = g;
  world.components = 99999;
  // put a breaker where it overlooks the route, and something slow on the path
  let built = false;
  outer:
  for (let r = 0; r < world.L.ROWS; r++)
    for (let c = 0; c < world.L.COLS; c++) {
      if (!E.buildTower(world, c, r, 'breaker')) continue;
      const t = world.towers[world.towers.length - 1];
      const tc = E.cellCenter(world.L, c, r);
      const reach = E.stats(world, t).range;
      for (let d = 0; d < world.pathLen; d += 8) {
        const p = E.atS(world.path, world.pathLen, d);
        if (Math.hypot(p.x - tc.x, p.y - tc.y) < reach * 0.8) {
          world.enemies = [{ type: 'load', dist: d, hp: 4000, maxhp: 4000, speed: 0, r: 15, slow: 0 }];
          built = true; break outer;
        }
      }
      E.sellTower(world, world.towers.length - 1);
    }
  assert.ok(built, 'a breaker is covering the route');

  let t = 1000;
  for (let i = 0; i < 400 && !world.slugs.length; i++) g.frame(t += 16);
  assert.equal(world.slugs.length, 1, 'a round is in the air');
  const hp = world.enemies[0].hp;
  g.frame(t += 16);                       // drawn mid-flight
  assert.deepEqual(g.errors, [], 'drawing a round in flight threw');
  assert.equal(world.enemies[0].hp, hp, 'and nothing has happened to the target yet');

  for (let i = 0; i < 400 && world.slugs.length; i++) g.frame(t += 16);
  assert.ok(world.enemies[0].hp < hp, 'it landed');
  g.frame(t += 16);                       // the shockwave
  assert.deepEqual(g.errors, [], 'the impact threw');
});

test('the HUD names the circuit and the difficulty, in the words the rest uses', async () => {
  const g = await bootAndStart(SHELL);
  const { world, E, window: w } = g;
  const doc = w.document;
  g.frame(1000);

  const meta = doc.querySelector('header .meta').textContent;
  assert.match(meta, /Circuit/, 'the HUD says circuit, like the picker and the banner');
  assert.doesNotMatch(meta, /Route/, 'and never route, which was the same thing under another name');
  assert.equal(doc.getElementById('uiRoute').textContent, `1/${E.ROUTE_COUNT}`);
  assert.equal(doc.getElementById('uiDifficulty').textContent,
    E.DIFFICULTIES[world.difficulty].name, 'and it states what this run is being played at');

  E.resetGame(world, { difficulty: 'hard', routeIndex: 0 });
  g.frame(1050);
  assert.equal(doc.getElementById('uiDifficulty').textContent, E.DIFFICULTIES.hard.name,
    'which follows the run rather than being written once');
  assert.deepEqual(g.errors, [], 'the HUD threw');
});

test('the gameplay strip fades out under a full-board panel', async () => {
  const g = await bootAndStart(SHELL);
  const { window: w } = g;
  const doc = w.document;
  assert.ok(!doc.body.classList.contains('panelOpen'), 'clear while playing');
  doc.getElementById('shopBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.ok(doc.body.classList.contains('panelOpen'), 'the armory dims the strip');
  doc.getElementById('shopClose').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.ok(!doc.body.classList.contains('panelOpen'), 'and closing it brings the strip back');
  assert.deepEqual(g.errors, [], 'the panel wiring threw');
});

test('the circuit picker puts the board on the left and the difficulties down the right', async () => {
  const g = await bootAndStart(SHELL);
  const { window: w, E } = g;
  const doc = w.document;
  // the picker is earned; render it directly rather than winning three circuits
  w.eval('renderPicker && renderPicker()');
  const rows = [...doc.querySelectorAll('#pickGrid .pickRow')];
  assert.equal(rows.length, E.ROUTE_COUNT, 'one row per circuit');
  const open = rows[0];
  assert.ok(open.querySelector('.pickTop canvas.pickMap'), 'the left column is the board preview');
  const diffs = open.querySelector('.pickDiffs');
  assert.ok(diffs, 'and the right column is the difficulty list');
  assert.equal(diffs.querySelectorAll('button').length, E.DIFFICULTY_KEYS.length,
    'every difficulty is offered, locked ones included');
  assert.deepEqual(g.errors, [], 'the picker threw');
});

test('an unearned class sits on the palette, locked, saying what earns it', async () => {
  const g = await bootAndStart(SHELL);            // a fresh player: nothing swept
  const { world, E, window: w } = g;
  const doc = w.document;
  world.components = 99999;
  g.frame(1000);

  const picks = [...doc.querySelectorAll('.pick')];
  assert.equal(picks.length, E.TOWER_KEYS.length, 'every class is on the strip');
  const sever = picks.find(b => /sever/i.test(b.textContent));
  assert.ok(sever, 'including the one that has to be earned');
  assert.ok(sever.classList.contains('locked'));
  assert.match(sever.textContent, /Medium/i, 'and it says what would earn it');

  // tapping it must not select it — a palette pointing at an unbuildable class
  // is a palette that will silently swallow the next tap on the board
  sever.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  sever.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  g.frame(1050);
  assert.ok(!sever.classList.contains('on'), 'it cannot be picked');

  // and the engine refuses it even if something did select it
  const cell = (() => {
    for (let r = 0; r < world.L.ROWS; r++)
      for (let c = 0; c < world.L.COLS; c++)
        if (E.canBuild(world, c, r, 'node')) return { c, r };
  })();
  assert.equal(E.buildTower(world, cell.c, cell.r, 'sever'), false, 'and cannot be built');
  assert.deepEqual(g.errors, [], 'the locked palette threw');
});

test('a swept player gets the class, and the two earned armory rows', async () => {
  const g = await bootAndStart(SHELL, swept());
  const { world, E, window: w } = g;
  const doc = w.document;
  world.components = 99999;
  g.frame(1000);

  const sever = [...doc.querySelectorAll('.pick')].find(b => /sever/i.test(b.textContent));
  assert.ok(!sever.classList.contains('locked'), 'Sever is on the palette for real');
  sever.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  g.frame(1050);
  assert.ok(sever.classList.contains('on'), 'and it can be picked');

  doc.getElementById('shopBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const buys = doc.querySelectorAll('#shopClasses .armTable button[data-t]');
  assert.equal(buys.length, E.TOWER_KEYS.length * E.CLASS_TRACKS.length,
    'every track is buyable on every class');
  assert.equal(doc.querySelectorAll('#shopClasses .armTable .cell.locked').length, 0,
    'and nothing is left locked');
  assert.deepEqual(g.errors, [], 'the earned armory threw');
});

test('the armory shows the earned rows locked rather than hiding them', async () => {
  const g = await bootAndStart(SHELL);            // fresh player again
  const { E, window: w } = g;
  const doc = w.document;
  g.frame(1000);
  doc.getElementById('shopBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  const heads = [...doc.querySelectorAll('#shopClasses .armTable .rh')].map(el => el.textContent);
  assert.equal(heads.length, E.CLASS_TRACKS.length, 'a row per track, earned or not');
  const locked = [...doc.querySelectorAll('#shopClasses .armTable .rh.locked')];
  assert.equal(locked.length, E.CLASS_TRACKS.length - E.CLASS_TRACKS_FREE.length,
    'the two earned tracks read as locked');

  /* The requirement lives in one cell spanning the row, *not* in the row head.
     Reported at v45: the head is a grid column sized to its content, so a
     sentence in there was the widest thing in the table and shoved every
     button off to the right. The label column carries a label. */
  for (const el of locked) {
    assert.ok(el.textContent.length < 16, `a row head is a label, not a sentence (got "${el.textContent}")`);
  }
  const lockedCells = [...doc.querySelectorAll('#shopClasses .armTable .cell.locked')];
  assert.equal(lockedCells.length, E.CLASS_TRACKS.length - E.CLASS_TRACKS_FREE.length,
    'one cell per locked row, not one per class per locked row');
  assert.match(lockedCells.map(el => el.textContent).join(' '), /Hard/i,
    'and it says what would earn the row');

  // the four open tracks are still buyable, so a locked row cannot break the grid
  const buys = doc.querySelectorAll('#shopClasses .armTable button[data-t]');
  assert.equal(buys.length, E.TOWER_KEYS.length * E.CLASS_TRACKS_FREE.length);
  assert.deepEqual(g.errors, [], 'the locked armory threw');
});

test('an open panel is bounded by the screen, and its buttons are one size', async () => {
  const g = await bootAndStart(SHELL, swept());
  const { world, E, window: w } = g;
  const doc = w.document;
  world.components = 99999;
  g.frame(1000);

  const root = doc.documentElement;
  assert.equal(root.style.getPropertyValue('--panel-max'), '', 'nothing reserved before a panel opens');
  doc.getElementById('shopBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  /* The armory grew past the stage at v45 and hid its own bottom behind a
     scroll — the stage is only what is left after the header and the controls
     strip, and two new rows did not fit. It may now grow over the (faded)
     strip, but never past the screen: `body` is `overflow:hidden` here, so
     below the fold is unreachable rather than scrollable. */
  const max = parseFloat(root.style.getPropertyValue('--panel-max'));
  assert.ok(max > 0, `the panel is bounded by a measured height (got ${max})`);

  /* Fixed columns, not `auto`/`1fr`: `1fr` is `minmax(auto,1fr)`, so the cell
     with the widest price took more than its share and the rest shrank to pay
     — the "buttons are various sizes" report. */
  const cols = w.getComputedStyle(doc.querySelector('.armTable')).gridTemplateColumns;
  assert.doesNotMatch(cols, /auto/, `every column is a fixed share (got "${cols}")`);
  assert.match(cols, /minmax\(0/, 'and the class columns cannot be widened by their contents');

  doc.getElementById('shopClose').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(g.errors, [], 'the armory panel threw');
});

test('a fork and a mark both draw on a real board', async () => {
  const g = await bootAndStart(SHELL, swept());
  const { world, E } = g;
  world.components = 99999;
  world.classUpgrades.node.chain = E.CLASS_MAX;

  /* A Sever and a Node covering the same stretch. Placed by *what they can
     see* rather than by the first free cell — a tower in the corner shoots
     nothing, and a test that placed two of them would pass its build
     assertions and then prove nothing at all. */
  /* Find a stretch of route that a buildable cell actually overlooks, and put
     both towers on it. Placing by the first free cell instead would pass its
     build assertions and prove nothing: a tower in the corner shoots nothing. */
  let d = null, built = 0;
  outer:
  for (let r = 0; r < world.L.ROWS && built < 2; r++)
    for (let c = 0; c < world.L.COLS && built < 2; c++) {
      const type = built === 0 ? 'sever' : 'node';
      if (!E.canBuild(world, c, r, type)) continue;
      const cc = E.cellCenter(world.L, c, r);
      /* 0.9 of the range, not 0.6: the route runs through cell centres and the
         cells are 64px, so the nearest buildable cell is a full cell away —
         at 0.6 of a 100px range nothing on the board qualifies and the search
         silently finds nothing. */
      const reach = E.TOWER_TYPES[type].base.range * 0.9;
      for (let s = 0; s < world.pathLen; s += 16) {
        const at = E.atS(world.path, world.pathLen, s);
        if (Math.hypot(at.x - cc.x, at.y - cc.y) > reach) continue;
        if (d === null) d = s;
        else if (Math.abs(s - d) > reach) continue;      // the same stretch, not another
        assert.equal(E.buildTower(world, c, r, type), true);
        built++;
        continue outer;
      }
    }
  assert.equal(built, 2, 'both towers cover the stretch the enemies are on');
  world.enemies = [0, 22, 44].map(off => ({
    type: 'surge', dist: d + off, hp: 400, maxhp: 400, speed: 0, r: 12, slow: 0, marked: 0,
  }));

  let t = 1000, sawMark = false;
  for (let i = 0; i < 600; i++) {
    g.frame(t += 16);
    if (world.enemies.some(e => e.marked > 0)) sawMark = true;
  }
  assert.ok(sawMark, 'something got marked, so the bracket art ran');
  assert.deepEqual(g.errors, [], 'drawing marks and forks threw');
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
