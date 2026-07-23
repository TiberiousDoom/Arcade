import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.js';

const gun0 = (w) => w.battery.guns[0];

const { path, pathLen } = E.buildPath();

/* ---------- path geometry ---------- */

test('path spans every row and accumulates arc length', () => {
  assert.equal(path.length, E.LAYOUT.ROWS * 2 + 1, 'rows plus the final descent');
  assert.equal(path[0].s, 0);
  for (let i = 1; i < path.length; i++) {
    assert.ok(path[i].s > path[i - 1].s, `s must increase at ${i}`);
  }
  assert.equal(pathLen, path[path.length - 1].s);
});

test('path serpentines: rows alternate direction', () => {
  // row 0 runs left->right, row 1 right->left, and so on
  for (let r = 0; r < E.LAYOUT.ROWS; r++) {
    const a = path[r * 2], b = path[r * 2 + 1];
    assert.equal(a.y, b.y, 'a row is horizontal');
    if (r % 2 === 0) assert.ok(b.x > a.x, `row ${r} goes right`);
    else assert.ok(b.x < a.x, `row ${r} goes left`);
  }
});

test('the path descends past the breach line', () => {
  // regression: the serpentine rows alone stopped above the floor, so a snake
  // could run the whole path without ever triggering a breach
  const end = path[path.length - 1];
  assert.ok(end.y > E.LAYOUT.FLOOR, `path must cross y=${E.LAYOUT.FLOOR}, ended at ${end.y}`);
});

test('atS flags off-path positions at both ends', () => {
  assert.equal(E.atS(path, pathLen, -50).off, true);
  assert.equal(E.atS(path, pathLen, 0).off, true);
  assert.equal(E.atS(path, pathLen, pathLen + 10).off, true);
  assert.equal(E.atS(path, pathLen, pathLen / 2).off, false);
});

test('atS interpolates linearly within a row', () => {
  const seg = path[1].s;
  const mid = E.atS(path, pathLen, seg / 2);
  assert.equal(mid.y, path[0].y);
  assert.ok(Math.abs(mid.x - (path[0].x + path[1].x) / 2) < 1e-6);
});

test('atS advances monotonically down the screen', () => {
  let prevY = -Infinity;
  for (let s = 1; s < pathLen; s += pathLen / 40) {
    const p = E.atS(path, pathLen, s);
    assert.ok(p.y >= prevY - 1e-6, 'y never moves back up');
    prevY = p.y;
  }
});

/* ---------- chain construction ---------- */

test('chain always leads with a head segment', () => {
  const ch = E.makeChain(12, 50, 0);
  assert.equal(ch.segs[0].kind, 'head');
  assert.equal(ch.segs.length, 12);
});

test('segment kinds are assigned deterministically', () => {
  const a = E.makeChain(20, 50, 0).segs.map(s => s.kind);
  const b = E.makeChain(20, 50, 0).segs.map(s => s.kind);
  assert.deepEqual(a, b);
  assert.ok(a.includes('armored'));
  assert.ok(a.includes('volatile'));
});

test('an untouched wave stays on screen for a playable stretch', () => {
  const first = pathLen / E.waveSpeed(1, pathLen);
  const tenth = pathLen / E.waveSpeed(10, pathLen);
  assert.ok(first > 25 && first < 60, `wave 1 traversal was ${first.toFixed(0)}s`);
  assert.ok(tenth < first, 'later waves press harder');
  assert.ok(tenth > 12, `wave 10 traversal was ${tenth.toFixed(0)}s`);
});

test('the tall board plays at the same pace as the standard one', () => {
  // speed is derived from path length, so a bigger board must not mean
  // a slower game
  const tall = E.buildPath(E.LAYOUT_TALL);
  for (const wv of [1, 5, 10]) {
    const a = pathLen / E.waveSpeed(wv, pathLen);
    const b = tall.pathLen / E.waveSpeed(wv, tall.pathLen);
    assert.ok(Math.abs(a - b) < 0.01, `wave ${wv}: ${a.toFixed(1)}s vs ${b.toFixed(1)}s`);
  }
});

test('the portrait board is genuinely phone-shaped, not the landscape one squashed', () => {
  // Retuned after real-device testing: the first portrait board was 880x800,
  // nearly square, and left a third of a phone screen empty. It is now much
  // taller than wide, with more rows to fill the extra height. Pace is NOT
  // affected — the traversal-time test above pins that across both layouts.
  const T = E.LAYOUT_TALL, L = E.LAYOUT;
  assert.ok(T.H / T.W > 1.6, `portrait aspect is ${(T.H / T.W).toFixed(2)}, wanted > 1.6`);
  assert.ok(T.W < L.W, 'narrower than landscape');
  assert.ok(T.ROWS > L.ROWS, 'more rows to cross, since there is more height');
  const tall = E.buildPath(T);
  assert.ok(tall.pathLen > pathLen, 'a longer journey on the taller board');
});

test('the thumb rest sits below the cannon, not inside the play area', () => {
  const L = E.LAYOUT_TALL;
  assert.ok(L.THUMB > 0, 'portrait reserves a rest band');
  assert.ok(L.CANNON_Y < L.H - L.THUMB + 1, 'cannon sits above the band');
  assert.ok(L.FLOOR < L.CANNON_Y, 'breach line stays above the cannon');
  const clearance = L.H - L.CANNON_Y;
  assert.ok(clearance > 140, `only ${clearance}px below the cannon to rest a thumb`);
});

test('the standard layout reserves no thumb band', () => {
  assert.equal(E.LAYOUT.THUMB, 0);
  assert.equal(E.LAYOUT.CANNON_Y, E.LAYOUT.H - 44);
});

test('the portrait descent still crosses its breach line', () => {
  const tall = E.buildPath(E.LAYOUT_TALL);
  const end = tall.path[tall.path.length - 1];
  assert.ok(end.y > E.LAYOUT_TALL.FLOOR, 'descent crosses the floor');
});

test('a world can be built on the tall layout', () => {
  const w = E.createWorld({ layout: E.LAYOUT_TALL });
  E.spawnWave(w);
  assert.equal(w.L.H, E.LAYOUT_TALL.H);
  assert.ok(w.chains.length === 1);
  for (let i = 0; i < 600; i++) E.step(w, 1 / 60);
  assert.ok(w.chains.length > 0 || w.breaches > 0, 'simulates without stalling');
});

test('wave scaling grows then caps', () => {
  assert.ok(E.waveCount(5) > E.waveCount(1));
  assert.ok(E.waveSpeed(5) > E.waveSpeed(1));
  assert.equal(E.waveCount(99), 40, 'segment count caps at 40');
});

test('segments trail the head by one spacing each', () => {
  const ch = E.makeChain(4, 0, 400);
  const head = E.segPos(path, pathLen, ch, 0);
  const third = E.segPos(path, pathLen, ch, 3);
  assert.ok(!head.off && !third.off);
  assert.ok(head.x !== third.x || head.y !== third.y);
});

/* ---------- recoil: the core mechanic ---------- */

test('recoil scales with how close to the head the cut lands', () => {
  const near = E.recoilGain(30, 9, 10);
  const far = E.recoilGain(30, 1, 10);
  assert.ok(near > far * 2, 'head cuts must pay far more than tail cuts');
});

test('cutting the tail-most segment yields no recoil', () => {
  assert.equal(E.recoilGain(30, 0, 10), 0);
});

test('recoil is zero when nothing remains to link up', () => {
  assert.equal(E.recoilGain(30, 5, 0), 0);
});

test('destroying a mid segment pushes the chain backward', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(10, 40, 500)];
  const before = w.chains[0].s;

  const seg = w.chains[0].segs[5];
  E.damageSeg(w, 0, 5, seg.hp);

  assert.ok(w.chains[0].recoil > 0, 'recoil debt accrued');
  E.stepChains(w, 0.5);
  assert.ok(w.chains[0].s < before, 'chain actually moved back');
});

test('recoil is paid off, then forward motion resumes', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(10, 40, 500)];
  w.chains[0].recoil = 20;

  for (let i = 0; i < 60; i++) E.stepChains(w, 1 / 60);
  assert.equal(w.chains[0].recoil, 0, 'debt cleared');

  const s = w.chains[0].s;
  E.stepChains(w, 0.5);
  assert.ok(w.chains[0].s > s, 'advancing again');
});

/* ---------- damage ---------- */

test('a segment survives partial damage and dies on lethal', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(6, 0, 400)];
  const before = w.chains[0].segs.length;

  assert.equal(E.damageSeg(w, 0, 1, 1), false);
  assert.equal(w.chains[0].segs.length, before, 'survives a chip');
  assert.equal(E.damageSeg(w, 0, 1, 99), true, 'dies on a lethal hit');
  assert.equal(w.chains[0].segs.length, before - 1);
});

test('volatile segments splash their neighbours', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(20, 0, 600)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'volatile');
  assert.ok(idx > 0, 'fixture contains a volatile segment');

  const neighbourHpBefore = w.chains[0].segs[idx + 1].hp;
  E.damageSeg(w, 0, idx, E.KIND.volatile.hp);
  // after the splice, the old idx+1 sits at idx
  assert.ok(w.chains[0].segs[idx].hp < neighbourHpBefore, 'neighbour took splash');
});

test('kills award score and scrap', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(6, 0, 400)];
  E.damageSeg(w, 0, 1, 99);
  assert.equal(w.score, E.KIND.std.score);
  assert.equal(w.scrap, E.KIND.std.scrap);
});

test('emptying a chain removes it from the world', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(1, 0, 400)];
  E.damageSeg(w, 0, 0, 99);
  assert.equal(w.chains.length, 0);
});

test('damageSeg is safe on indices that no longer exist', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(3, 0, 400)];
  assert.equal(E.damageSeg(w, 0, 99, 5), false);
  assert.equal(E.damageSeg(w, 7, 0, 5), false);
});

/* ---------- touch aiming ---------- */

test('aim gain is fine when dragging slowly', () => {
  const g = E.aimGain(0);
  assert.equal(g, E.AIM_FINE);
  // A 40px careful drag stays a correction rather than a wild swing. Measured
  // against the arc rather than an absolute figure, so retuning the gain does
  // not silently invalidate the intent.
  const span = E.AIM_MAX - E.AIM_MIN;
  const swing = 40 * g;
  assert.ok(swing < span * 0.2, `40px slow drag covered ${(swing / span * 100).toFixed(0)}% of the arc`);
});

test('a full sweep of the arc fits inside a phone-width drag', () => {
  // regression on real-device feedback: at the old gain, crossing the arc took
  // nearly 500px of drag — wider than the phone — so aiming felt like work
  const span = E.AIM_MAX - E.AIM_MIN;
  const pxAtFineGain = span / E.aimGain(0);
  assert.ok(pxAtFineGain < 300, `needs ${pxAtFineGain.toFixed(0)}px of slow drag to cross the arc`);
});

test('aim responds from the very first pixel', () => {
  // a purely quadratic ramp is flat near zero and feels dead; gain at a
  // gentle drag speed must be meaningfully above the floor
  const gentle = E.aimGain(E.AIM_RAMP * 0.25);
  assert.ok(gentle > E.AIM_FINE * 1.2, 'low-speed drags already accelerate');
});

test('aim gain accelerates for fast drags', () => {
  assert.ok(E.aimGain(E.AIM_RAMP) > E.aimGain(0) * 3, 'fast drags get real leverage');
  assert.equal(E.aimGain(E.AIM_RAMP), E.AIM_FINE * E.AIM_COARSE_MULT, 'reaches full gain');
});

test('aim gain is symmetric and capped', () => {
  assert.equal(E.aimGain(500), E.aimGain(-500), 'direction does not change gain');
  assert.equal(E.aimGain(1e6), E.aimGain(E.AIM_RAMP), 'gain saturates');
});

test('a fast swipe can cross the full firing arc', () => {
  const span = E.AIM_MAX - E.AIM_MIN;
  const swipe = E.aimDelta(300, 300 / 1400);
  assert.ok(Math.abs(swipe) >= span * 0.8, `300px swipe covered ${swipe.toFixed(2)} of ${span.toFixed(2)}`);
});

test('a normal drag makes real progress across the arc', () => {
  // guards against the aim feeling sluggish: a comfortable thumb drag
  // should reorient meaningfully, not inch along
  const span = E.AIM_MAX - E.AIM_MIN;
  let total = 0;
  for (let i = 0; i < 10; i++) total += E.aimDelta(8, 0.03);
  assert.ok(Math.abs(total) > span * 0.15, `80px drag covered ${(total / span * 100).toFixed(0)}% of arc`);
});

test('a slow drag still gives fine control', () => {
  const span = E.AIM_MAX - E.AIM_MIN;
  const step = Math.abs(E.aimDelta(6, 6 / 60));
  assert.ok(step < span * 0.04, `6px drag covered ${(step / span * 100).toFixed(1)}% of the arc`);
});

test('aimDelta preserves drag direction', () => {
  assert.ok(E.aimDelta(50, 0.1) > 0);
  assert.ok(E.aimDelta(-50, 0.1) < 0);
  assert.equal(E.aimDelta(0, 0.1), 0);
});

test('aimDelta survives a zero or missing timestep', () => {
  assert.equal(Number.isFinite(E.aimDelta(30, 0)), true, 'no divide-by-zero blowup');
});

/* ---------- held trim ---------- */

test('trim starts fine and ramps to coarse', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.equal(E.trimRate(0), E.TRIM_MIN);
  assert.ok(near(E.trimRate(E.TRIM_RAMP), E.TRIM_MAX));
  assert.ok(near(E.trimRate(99), E.TRIM_MAX), 'ramp saturates');
  assert.ok(E.trimRate(0.1) < E.trimRate(0.4), 'monotonic');
});

test('a quick trim tap is a small nudge', () => {
  const nudge = E.trimRate(0) * 0.08;
  assert.ok(nudge < 0.06, `tap moved ${nudge.toFixed(3)} rad`);
});

/* ---------- tap responsiveness ---------- */

test('a tap during cooldown is queued, not dropped', () => {
  const w = E.createWorld();
  E.fire(w);
  assert.equal(w.shots.length, 1);

  E.queueShot(w);                       // tap arrives mid-cooldown
  assert.equal(w.shots.length, 1, 'not fired yet');
  assert.equal(w.cannon.queued, true, 'remembered');

  E.stepCannon(w, E.OD_TIERS[0].rate + 0.01, false);
  assert.equal(w.shots.length, 2, 'fired as soon as the barrel cleared');
  assert.equal(w.cannon.queued, false, 'queue consumed');
});

test('a tap on a ready barrel fires immediately', () => {
  const w = E.createWorld();
  assert.equal(E.queueShot(w), true);
  assert.equal(w.shots.length, 1);
});

test('the queue holds at most one shot', () => {
  const w = E.createWorld();
  E.fire(w);
  E.queueShot(w); E.queueShot(w); E.queueShot(w);
  E.stepCannon(w, E.OD_TIERS[0].rate + 0.01, false);
  assert.equal(w.shots.length, 2, 'spamming taps does not bank shots');
});

test('a locked barrel refuses and clears queued taps', () => {
  const w = E.createWorld();
  gun0(w).locked = 1;
  assert.equal(E.queueShot(w), false);
  E.stepCannon(w, 0.1, false);
  assert.equal(w.shots.length, 0, 'nothing fired while locked');
  assert.equal(w.battery.queued, false, 'queue does not survive the lock');
});

test('resets clear any pending shot', () => {
  const w = E.createWorld();
  E.fire(w); E.queueShot(w);
  E.resetRun(w);
  assert.equal(w.cannon.queued, false);
});

/* ---------- shielded segments ---------- */

test('a head-on shot is deflected by the plate', () => {
  const seg = { kind: 'shielded' };
  const heading = { x: 1, y: 0 };            // segment moving right
  // shot travelling left, straight into the leading face
  assert.equal(E.isDeflected(seg, heading, -520, 0), true);
});

test('a shot from the flank gets through', () => {
  const seg = { kind: 'shielded' };
  const heading = { x: 1, y: 0 };
  assert.equal(E.isDeflected(seg, heading, 0, -520), false, 'from directly below');
  assert.equal(E.isDeflected(seg, heading, 520, 0), false, 'from behind');
});

test('only shielded segments deflect', () => {
  const heading = { x: 1, y: 0 };
  for (const k of ['std', 'armored', 'volatile', 'head', 'regen', 'splitter']) {
    assert.equal(E.isDeflected({ kind: k }, heading, -520, 0), false, `${k} must not deflect`);
  }
});

test('the shield arc is frontal, not full coverage', () => {
  const seg = { kind: 'shielded' };
  const heading = { x: 1, y: 0 };
  // just outside the arc on either side must pass
  const a = E.SHIELD_ARC + 0.12;
  assert.equal(E.isDeflected(seg, heading, -Math.cos(a) * 520, Math.sin(a) * 520), false);
});

test('segment heading follows the path direction', () => {
  const ch = E.makeChain(4, 0, 300);
  const h = E.segHeading(path, pathLen, ch, 0);
  assert.ok(Math.abs(Math.hypot(h.x, h.y) - 1) < 1e-6, 'unit vector');
  assert.ok(Math.abs(h.x) > 0.9, 'first row runs horizontally');
});

test('a deflected shot survives and keeps the streak', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(14, 0, 700)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'shielded');
  assert.ok(idx > 0, 'fixture has a shielded segment');

  const sp = E.segPos(path, pathLen, w.chains[0], idx);
  const h = E.segHeading(path, pathLen, w.chains[0], idx);
  const hpBefore = w.chains[0].segs[idx].hp;
  // fire straight into the face
  w.shots = [{ x: sp.x, y: sp.y, vx: -h.x * 520, vy: -h.y * 520, dmg: 1, pierce: 0, r: 3.2 }];
  E.stepShots(w, 1 / 60);

  assert.equal(w.chains[0].segs[idx].hp, hpBefore, 'no damage through the plate');
  assert.equal(w.shots.length, 1, 'shot bounced rather than being consumed');
});

/* ---------- regenerating segments ---------- */

test('a regenerator heals over time', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(20, 0, 700)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'regen');
  assert.ok(idx > 0, 'fixture has a regenerator');

  const seg = w.chains[0].segs[idx];
  seg.hp = 1;
  E.stepChains(w, 1.0);
  assert.ok(seg.hp > 1, `healed to ${seg.hp}`);
});

test('regeneration never exceeds the cap', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(20, 0, 700)];
  const seg = w.chains[0].segs.find(s => s.kind === 'regen');
  seg.hp = seg.maxhp - 0.1;
  E.stepChains(w, 10);
  assert.equal(seg.hp, seg.maxhp);
});

test('only regenerators heal', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(20, 0, 700)];
  const others = w.chains[0].segs.filter(s => s.kind !== 'regen');
  for (const s of others) s.hp = 1;
  E.stepChains(w, 2);
  for (const s of others) assert.equal(s.hp, 1, `${s.kind} must not heal`);
});

test('a destroyed regenerator does not come back', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(20, 0, 700)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'regen');
  const before = w.chains[0].segs.length;
  E.damageSeg(w, 0, idx, 99);
  E.stepChains(w, 5);
  assert.equal(w.chains[0].segs.length, before - 1);
});

/* ---------- splitters ---------- */

test('splitters are never placed near either end', () => {
  for (let n = 8; n <= 26; n++) {
    for (let i = 0; i < n; i++) {
      if (E.kindForIndex(i, n) === 'splitter') {
        assert.ok(i >= E.SPLIT_MARGIN, `splitter at ${i} of ${n} is too near the head`);
        assert.ok(n - i > E.SPLIT_MARGIN, `splitter at ${i} of ${n} leaves a stub`);
      }
    }
  }
});

test('splitters are rare', () => {
  const kinds = Array.from({ length: 26 }, (_, i) => E.kindForIndex(i, 26));
  const n = kinds.filter(k => k === 'splitter').length;
  assert.ok(n >= 1, 'at least one appears in a long chain');
  assert.ok(n <= 3, `${n} splitters in 26 segments is not rare`);
});

test('destroying a splitter produces two independent chains', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(20, 40, 800)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'splitter');
  assert.ok(idx > 0, 'fixture has a splitter');
  const total = w.chains[0].segs.length;

  E.damageSeg(w, 0, idx, 99);
  assert.equal(w.chains.length, 2, 'chain came apart');
  assert.equal(
    w.chains[0].segs.length + w.chains[1].segs.length,
    total - 1,
    'no segments lost or duplicated',
  );
});

test('the tail half grows its own head', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(20, 40, 800)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'splitter');
  E.damageSeg(w, 0, idx, 99);
  assert.equal(w.chains[1].segs[0].kind, 'head', 'new head at the front of the tail');
  assert.equal(w.chains[1].segs[0].hp, E.KIND.head.hp, 'at full head health');
});

test('a split pays no recoil', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(20, 40, 800)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'splitter');
  E.damageSeg(w, 0, idx, 99);
  assert.equal(w.chains[0].recoil, 0, 'splitting buys no time — that is the trade');
});

test('a chain can only split once', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(26, 40, 900)];
  const first = w.chains[0].segs.findIndex(s => s.kind === 'splitter');
  E.damageSeg(w, 0, first, 99);
  assert.equal(w.chains.length, 2);

  // any further splitter in the front half must fall back to recoil
  const more = w.chains[0].segs.findIndex(s => s.kind === 'splitter');
  if (more > 0) {
    E.damageSeg(w, 0, more, 99);
    assert.equal(w.chains.length, 2, 'no second split from the same chain');
  }
});

test('splitting is capped so late waves stay readable', () => {
  const w = E.createWorld();
  w.chains = [
    E.makeChain(20, 40, 800),
    E.makeChain(20, 40, 600),
    E.makeChain(20, 40, 400),
  ];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'splitter');
  E.damageSeg(w, 0, idx, 99);
  assert.equal(w.chains.length, E.MAX_CHAINS, 'at the cap, a splitter just dies');
});

test('a splitter too near an end falls back to recoil', () => {
  const w = E.createWorld();
  const ch = E.makeChain(10, 40, 500);
  // force a splitter one from the tail, where a split would leave a stub
  ch.segs[9] = { kind: 'splitter', hp: 1, maxhp: 4, r: 15, flash: 0, deflect: 0 };
  w.chains = [ch];

  E.damageSeg(w, 0, 9, 99);
  assert.equal(w.chains.length, 1, 'no split from a tail-end splitter');
});

test('both halves keep moving independently after a split', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(20, 40, 800)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'splitter');
  E.damageSeg(w, 0, idx, 99);

  const a0 = w.chains[0].s, b0 = w.chains[1].s;
  E.stepChains(w, 0.5);
  assert.ok(w.chains[0].s > a0, 'front half advances');
  assert.ok(w.chains[1].s > b0, 'rear half advances');
  assert.ok(w.chains[0].s > w.chains[1].s, 'front stays ahead');
});

test('the split chain does not teleport', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(20, 40, 800)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'splitter');
  const wherePreSplit = E.segPos(path, pathLen, w.chains[0], idx);

  E.damageSeg(w, 0, idx, 99);
  const newHead = E.segPos(path, pathLen, w.chains[1], 0);
  assert.ok(
    Math.hypot(newHead.x - wherePreSplit.x, newHead.y - wherePreSplit.y) < 40,
    'the new head appears where the splitter was',
  );
});

test('a wave is only clear once every chain is gone', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(6, 40, 400), E.makeChain(6, 40, 200)];
  w.chains[0].segs = [];
  E.step(w, 1 / 60);
  assert.equal(w.waveClear, false, 'one surviving chain keeps the wave alive');
});

/* ---------- upgrades ---------- */

test('every branch has one more tier entry than it has costs', () => {
  for (const b of E.BRANCHES) {
    const U = E.UPGRADES[b];
    assert.equal(U.costs.length, E.MAX_TIER, `${b} needs ${E.MAX_TIER} costs`);
    assert.equal(U.tiers.length, E.MAX_TIER + 1, `${b} needs a tier 0 plus ${E.MAX_TIER}`);
  }
});

test('costs escalate within every branch', () => {
  for (const b of E.BRANCHES) {
    const c = E.UPGRADES[b].costs;
    for (let i = 1; i < c.length; i++) {
      assert.ok(c[i] > c[i - 1], `${b} tier ${i} must cost more than tier ${i - 1}`);
    }
  }
});

test('a new run starts with an empty tree', () => {
  const w = E.createWorld();
  for (const b of E.BRANCHES) assert.equal(w.upgrades[b], 0);
});

test('buying spends scrap and raises the tier', () => {
  const w = E.createWorld();
  w.scrap = 1000;
  const cost = E.upgradeCost(w.upgrades, 'barrel');
  assert.equal(E.buyUpgrade(w, 'barrel'), true);
  assert.equal(w.upgrades.barrel, 1);
  assert.equal(w.scrap, 1000 - cost);
});

test('you cannot buy what you cannot afford', () => {
  const w = E.createWorld();
  w.scrap = 0;
  assert.equal(E.canAfford(w, 'barrel'), false);
  assert.equal(E.buyUpgrade(w, 'barrel'), false);
  assert.equal(w.upgrades.barrel, 0);
});

test('a branch cannot be pushed past its last tier', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  for (let i = 0; i < E.MAX_TIER; i++) assert.equal(E.buyUpgrade(w, 'chamber'), true);
  assert.equal(w.upgrades.chamber, E.MAX_TIER);
  assert.equal(E.upgradeCost(w.upgrades, 'chamber'), null, 'no cost once maxed');
  assert.equal(E.buyUpgrade(w, 'chamber'), false);
  assert.equal(w.upgrades.chamber, E.MAX_TIER, 'tier unchanged');
});

test('unknown branches are rejected', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  assert.equal(E.buyUpgrade(w, 'nonsense'), false);
  assert.equal(w.scrap, 1e6, 'no scrap taken');
});

test('stats resolve from the current tiers', () => {
  const w = E.createWorld();
  const base = E.stats(w);
  w.scrap = 1e6;
  E.buyUpgrade(w, 'barrel');
  const up = E.stats(w);
  assert.ok(up.dmg > base.dmg, 'barrel raises damage');
  assert.equal(up.shotSpeed, base.shotSpeed, 'other branches untouched');
});

test('each branch changes something the others do not', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  const base = E.stats(w);
  const touched = {};
  for (const b of E.BRANCHES) {
    const t = E.createWorld();
    t.scrap = 1e6;
    for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(t, b);
    const s = E.stats(t);
    touched[b] = Object.keys(s).filter(k => s[k] !== base[k]);
    assert.ok(touched[b].length > 0, `${b} must change something`);
  }
  // no two branches should govern exactly the same stats
  const sigs = Object.values(touched).map(k => k.sort().join(','));
  assert.equal(new Set(sigs).size, sigs.length, 'branches overlap entirely');
});

test('the first shop visit is never empty-handed', () => {
  // wave 1 must fund at least one upgrade, or the shop feels pointless
  const ch = E.makeChain(E.waveCount(1), 100, 0);
  const income = ch.segs.reduce((a, s) => a + E.KIND[s.kind].scrap, 0);
  const cheapest = Math.min(...E.BRANCHES.map(b => E.UPGRADES[b].costs[0]));
  assert.ok(income >= cheapest, `wave 1 pays ${income}, cheapest upgrade is ${cheapest}`);
});

test('a long run cannot afford everything', () => {
  // the tree alone is now affordable by late game, but mounts and gun
  // unlocks are extra sinks — total spend must outrun total income, forcing
  // a choice between a deeper tree and a wider battery
  let income = 0;
  for (let wv = 1; wv <= 12; wv++) {
    const ch = E.makeChain(E.waveCount(wv), 100, 0);
    income += ch.segs.reduce((a, s) => a + E.KIND[s.kind].scrap, 0);
  }
  const treeCost = E.fullTreeCost();
  const mountCost = E.MOUNT_COST.slice(1).reduce((a, b) => a + b, 0);
  const gunCost = E.GUN_KEYS.slice(1).reduce((a, k) => a + E.GUN_TYPES[k].unlock, 0);
  const everything = treeCost + mountCost + gunCost;

  assert.ok(income < everything, `12 waves earns ${income}, everything costs ${everything}`);
  assert.ok(income > treeCost * 0.5, 'but a good run still makes real progress');
});

test('upgrades and overdrive multiply rather than replace', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(w, 'barrel');

  E.fire(w);
  const plain = w.shots[w.shots.length - 1].dmg;
  gun0(w).cool = 0;
  w.battery.od = 3;
  E.fire(w);
  const boosted = w.shots[w.shots.length - 1].dmg;
  assert.ok(boosted > plain, 'overdrive still adds on top of the tree');
  assert.ok(plain > E.OD_TIERS[0].dmg, 'the tree alone already raised damage');
});

test('chamber tiers make overheating harder', () => {
  const hot = E.createWorld();
  const cool = E.createWorld();
  cool.scrap = 1e6;
  for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(cool, 'chamber');

  const shotsUntilLock = (w) => {
    let n = 0;
    while (n < 300 && gun0(w).locked === 0) {
      E.fire(w);
      E.stepCannon(w, E.OD_TIERS[w.battery.od].rate, false);
      n++;
    }
    return n;
  };
  assert.ok(shotsUntilLock(cool) > shotsUntilLock(hot), 'a better chamber sustains fire longer');
});

test('munitions grants extra pierce on top of overdrive', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(w, 'munitions');
  E.fire(w);
  const shot = w.shots[w.shots.length - 1];
  assert.ok(shot.pierce >= E.UPGRADES.munitions.tiers[E.MAX_TIER].pierce);
});

test('wall bounces are limited by munitions', () => {
  const w = E.createWorld();
  // a shot with one bounce left dies on the second wall
  w.shots = [{ x: 10, y: 300, vx: -600, vy: 0, dmg: 1, pierce: 0, r: 3.2, bounces: 1, bounced: 0 }];
  E.stepShots(w, 0.05);
  assert.equal(w.shots.length, 1, 'first bounce allowed');
  assert.equal(w.shots[0].bounced, 1);

  for (let i = 0; i < 200 && w.shots.length; i++) E.stepShots(w, 0.05);
  assert.equal(w.shots.length, 0, 'expired after its bounce budget');
});

test('optics speeds shots up', () => {
  const w = E.createWorld();
  E.fire(w);
  const slow = w.shots[w.shots.length - 1];
  const v0 = Math.hypot(slow.vx, slow.vy);

  w.scrap = 1e6;
  for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(w, 'optics');
  gun0(w).cool = 0;
  E.fire(w);
  const fast = w.shots[w.shots.length - 1];
  assert.ok(Math.hypot(fast.vx, fast.vy) > v0);
});

test('resetting a run wipes the tree', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  E.buyUpgrade(w, 'barrel');
  E.buyUpgrade(w, 'optics');
  E.resetRun(w);
  for (const b of E.BRANCHES) assert.equal(w.upgrades[b], 0, `${b} reset`);
  assert.equal(w.scrap, 0);
});

test('a bigger battery measurably improves survival', () => {
  // with longer, tankier snakes, raw firepower is the survival lever — and
  // the clearest source of it is more guns
  const aim = (w) => {
    let best = null, bd = Infinity;
    for (const ch of w.chains) {
      for (let i = 0; i < ch.segs.length; i++) {
        const p = E.segPos(w.path, w.pathLen, ch, i);
        if (p.off) continue;
        const d = Math.hypot(p.x - w.L.W / 2, p.y - w.battery.y);
        if (d < bd) { bd = d; best = p; }
      }
    }
    if (best) w.battery.ang = E.clampAim(Math.atan2(best.y - w.battery.y, best.x - w.L.W / 2));
  };

  const run = (mounts) => {
    const w = E.createWorld();
    w.lives = 99;
    for (let m = 1; m < mounts; m++) w.battery.guns.push(E.makeGun(w.L.W * E.MOUNT_X[m]));
    E.spawnWave(w);
    let waves = 0;
    for (let i = 0; i < 60 * 400 && waves < 4; i++) {
      aim(w);
      E.step(w, 1 / 60, true);
      if (w.shopOpen) { E.nextWave(w); waves++; }
    }
    return { waves, breaches: w.breaches };
  };

  const solo = run(1);
  const battery = run(3);
  assert.ok(battery.waves >= solo.waves, 'more guns clears at least as far');
  assert.ok(battery.breaches < solo.breaches, `3 guns leaked ${battery.breaches} vs ${solo.breaches} solo`);
});

test('the shop is reachable in ordinary play', () => {
  // guards against a regression where the wave never clears and the whole
  // progression loop is dead
  const w = E.createWorld();
  w.lives = 99;
  for (let m = 1; m < 3; m++) w.battery.guns.push(E.makeGun(w.L.W * E.MOUNT_X[m]));
  E.spawnWave(w);
  let opened = false;
  for (let i = 0; i < 60 * 300 && !opened; i++) {
    let best = null, bd = Infinity;
    for (const ch of w.chains) {
      for (let j = 0; j < ch.segs.length; j++) {
        const p = E.segPos(w.path, w.pathLen, ch, j);
        if (p.off) continue;
        const d = Math.hypot(p.x - w.L.W / 2, p.y - w.battery.y);
        if (d < bd) { bd = d; best = p; }
      }
    }
    if (best) w.battery.ang = E.clampAim(Math.atan2(best.y - w.battery.y, best.x - w.L.W / 2));
    E.step(w, 1 / 60, true);
    if (w.shopOpen) opened = true;
  }
  assert.ok(opened, 'a competent player reaches the shop');
});

/* ---------- power-ups ---------- */

test('every drop-table entry is a real power-up', () => {
  for (const k of E.DROP_TABLE) {
    assert.ok(E.POWERUPS[k], `${k} is not defined`);
  }
});

test('the drop table favours situational effects over strong ones', () => {
  const count = (k) => E.DROP_TABLE.filter(x => x === k).length;
  assert.ok(count('freeze') < count('spread'), 'freeze is rarer than spread');
  assert.ok(count('shield') < count('rapid'), 'shield is rarer than rapid');
});

test('carriers drop a pickup when destroyed', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(16, 0, 700)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'carrier');
  assert.ok(idx > 0, 'fixture has a carrier');

  assert.equal(w.pickups.length, 0);
  E.damageSeg(w, 0, idx, 99);
  assert.equal(w.pickups.length, 1, 'exactly one pickup dropped');
  assert.ok(E.POWERUPS[w.pickups[0].kind], 'dropped a valid kind');
});

test('non-carriers drop nothing', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(16, 0, 700)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'std');
  E.damageSeg(w, 0, idx, 99);
  assert.equal(w.pickups.length, 0);
});

test('pickups fall and are caught above the cannon', () => {
  const w = E.createWorld();
  E.spawnPickup(w, w.cannon.x, w.cannon.y - 260, 'rapid');
  for (let i = 0; i < 60 * 6 && w.pickups.length; i++) E.stepPickups(w, 1 / 60);
  assert.equal(w.pickups.length, 0, 'pickup was caught');
  assert.ok(E.hasEffect(w, 'rapid'), 'effect applied');
});

test('a missed pickup expires instead of lingering', () => {
  const w = E.createWorld();
  E.spawnPickup(w, 40, 0, 'rapid');           // far from the cannon
  for (let i = 0; i < 60 * 20 && w.pickups.length; i++) E.stepPickups(w, 1 / 60);
  assert.equal(w.pickups.length, 0);
  assert.equal(E.hasEffect(w, 'rapid'), false, 'no effect from a missed pickup');
});

test('a shot can claim a pickup mid-air', () => {
  const w = E.createWorld();
  E.spawnPickup(w, 400, 300, 'pierce');
  w.shots = [{ x: 400, y: 300, vx: 0, vy: -520, dmg: 1, pierce: 0, r: 3.2, bounces: 2 }];
  E.stepShots(w, 1 / 60);
  assert.equal(w.pickups.length, 0, 'pickup claimed');
  assert.equal(w.shots.length, 0, 'shot consumed');
  assert.ok(E.hasEffect(w, 'pierce'));
});

test('timed effects tick down and expire', () => {
  const w = E.createWorld();
  E.applyPowerup(w, 'rapid');
  assert.ok(E.hasEffect(w, 'rapid'));
  E.stepPickups(w, E.POWERUPS.rapid.dur + 0.1);
  assert.equal(E.hasEffect(w, 'rapid'), false);
});

test('collecting the same effect twice extends it', () => {
  const w = E.createWorld();
  E.applyPowerup(w, 'rapid');
  const once = w.effects.rapid;
  E.applyPowerup(w, 'rapid');
  assert.ok(w.effects.rapid > once, 'duration stacks rather than refreshing');
});

test('rapid shortens the cooldown', () => {
  const a = E.createWorld();
  const b = E.createWorld();
  E.applyPowerup(b, 'rapid');
  E.fire(a); E.fire(b);
  assert.ok(b.battery.guns[0].cool < a.battery.guns[0].cool, 'rapid fires faster');
});

test('spread fires a three-shot fan', () => {
  const w = E.createWorld();
  E.applyPowerup(w, 'spread');
  E.fire(w);
  assert.equal(w.shots.length, 3, 'centre plus two flankers');  // one gun, fan of 3
  const angles = w.shots.map(s => Math.atan2(s.vy, s.vx));
  assert.equal(new Set(angles.map(a => a.toFixed(3))).size, 3, 'all at different angles');
});

test('pierce and ricochet raise their shot properties', () => {
  const plain = E.createWorld();
  E.fire(plain);
  const p1 = plain.shots[plain.shots.length - 1];

  const pw = E.createWorld();
  E.applyPowerup(pw, 'pierce');
  E.fire(pw);
  assert.ok(pw.shots[pw.shots.length - 1].pierce > p1.pierce);

  const rw = E.createWorld();
  E.applyPowerup(rw, 'ricochet');
  E.fire(rw);
  assert.ok(rw.shots[rw.shots.length - 1].bounces > p1.bounces);
});

test('freeze halts the snake without freezing the player', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(8, 100, 400)];
  E.applyPowerup(w, 'freeze');

  const before = w.chains[0].s;
  E.stepChains(w, 0.5);
  assert.equal(w.chains[0].s, before, 'chain did not advance');

  E.stepPickups(w, E.POWERUPS.freeze.dur + 0.1);
  E.stepChains(w, 0.5);
  assert.ok(w.chains[0].s > before, 'moves again once freeze lapses');
});

test('a frozen regenerator still heals', () => {
  // freeze stops movement, not biology — otherwise freeze silently doubles
  // as a regen counter, which is not what it says on the tin
  const w = E.createWorld();
  w.chains = [E.makeChain(20, 100, 700)];
  const seg = w.chains[0].segs.find(s => s.kind === 'regen');
  seg.hp = 1;
  E.applyPowerup(w, 'freeze');
  E.stepChains(w, 1);
  assert.ok(seg.hp > 1);
});

test('a bomb damages segments near where it was caught', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(10, 0, 500)];
  const target = E.segPos(path, pathLen, w.chains[0], 3);
  const before = w.chains[0].segs.length;

  w.bombAt = { x: target.x, y: target.y };
  E.applyPowerup(w, 'bomb');
  w.bombAt = null;
  assert.ok(w.chains[0].segs.length < before, 'blast cleared nearby segments');
});

test('a bomb does not reach across the whole board', () => {
  // regression: an inflated radius let a bomb clear segments the player
  // never got near, including splitters they meant to leave alone
  const w = E.createWorld();
  w.chains = [E.makeChain(10, 0, 500)];
  const far = E.segPos(path, pathLen, w.chains[0], 0);
  const before = w.chains[0].segs.length;

  // detonate far away from the chain
  w.bombAt = { x: far.x, y: far.y + E.BOMB_RADIUS * 3 };
  E.applyPowerup(w, 'bomb');
  w.bombAt = null;
  assert.equal(w.chains[0].segs.length, before, 'distant segments untouched');
});

test('a shield charge absorbs one breach', () => {
  const w = E.createWorld();
  E.spawnWave(w);
  E.applyPowerup(w, 'shield');
  assert.equal(w.shieldCharges, 1);

  const lives = w.lives;
  E.breach(w);
  assert.equal(w.lives, lives, 'no life lost');
  assert.equal(w.shieldCharges, 0, 'charge spent');

  E.breach(w);
  assert.equal(w.lives, lives - 1, 'the next one costs a life');
});

test('shield charges stack', () => {
  const w = E.createWorld();
  E.applyPowerup(w, 'shield');
  E.applyPowerup(w, 'shield');
  assert.equal(w.shieldCharges, 2);
});

test('unknown power-ups are rejected', () => {
  const w = E.createWorld();
  assert.equal(E.applyPowerup(w, 'nonsense'), false);
});

test('pickups are cleared between waves', () => {
  const w = E.createWorld();
  E.spawnPickup(w, 400, 200, 'rapid');
  E.spawnWave(w);
  assert.equal(w.pickups.length, 0);
});

test('resetting a run clears effects and charges', () => {
  const w = E.createWorld();
  E.applyPowerup(w, 'rapid');
  E.applyPowerup(w, 'shield');
  E.spawnPickup(w, 400, 200, 'bomb');
  E.resetRun(w);
  assert.deepEqual(w.effects, {});
  assert.equal(w.shieldCharges, 0);
  assert.equal(w.pickups.length, 0);
});

/* ---------- juice ---------- */

test('destroying a segment triggers hit-stop and shake', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(8, 0, 400)];
  E.damageSeg(w, 0, 1, 99);
  assert.ok(w.hitStop > 0, 'brief freeze on impact');
  assert.ok(w.shake > 0, 'screen shake on impact');
});

test('tougher targets stop the world for longer', () => {
  const soft = E.createWorld();
  soft.chains = [E.makeChain(16, 0, 700)];
  const softIdx = soft.chains[0].segs.findIndex(s => s.kind === 'std');
  E.damageSeg(soft, 0, softIdx, 99);

  const hard = E.createWorld();
  hard.chains = [E.makeChain(16, 0, 700)];
  const hardIdx = hard.chains[0].segs.findIndex(s => s.kind === 'armored');
  E.damageSeg(hard, 0, hardIdx, 99);

  assert.ok(hard.hitStop > soft.hitStop, 'armored kills hit harder');
});

test('hit-stop pauses the simulation but always resolves', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(8, 100, 400)];
  w.hitStop = 0.05;
  const s0 = w.chains[0].s;

  E.step(w, 1 / 60);
  assert.equal(w.chains[0].s, s0, 'world held still');

  for (let i = 0; i < 30; i++) E.step(w, 1 / 60);
  assert.equal(w.hitStop, 0, 'hit-stop always expires');
  assert.ok(w.chains[0].s > s0, 'motion resumed');
});

test('shake decays to zero', () => {
  const w = E.createWorld();
  w.shake = 1;
  for (let i = 0; i < 120; i++) E.step(w, 1 / 60);
  assert.equal(w.shake, 0);
});

test('a breach shakes harder than a routine kill', () => {
  const kill = E.createWorld();
  kill.chains = [E.makeChain(8, 0, 400)];
  E.damageSeg(kill, 0, 1, 99);

  const hit = E.createWorld();
  E.spawnWave(hit);
  E.breach(hit);
  assert.ok(hit.shake > kill.shake);
});

test('power-ups appear and take effect during real play', () => {
  const aim = (w) => {
    let best = null, bd = Infinity;
    for (const ch of w.chains) {
      for (let i = 0; i < ch.segs.length; i++) {
        const p = E.segPos(w.path, w.pathLen, ch, i);
        if (p.off) continue;
        const d = Math.hypot(p.x - w.cannon.x, p.y - w.cannon.y);
        if (d < bd) { bd = d; best = p; }
      }
    }
    if (best) w.cannon.ang = E.clampAim(Math.atan2(best.y - w.cannon.y, best.x - w.cannon.x));
  };

  const w = E.createWorld();
  w.wave = 6;
  E.spawnWave(w);
  w.lives = 99;

  let collected = 0;
  const seen = new Set();
  for (let i = 0; i < 60 * 120; i++) {
    aim(w);
    const before = w.pickups.length;
    E.step(w, 1 / 60, true);
    if (w.pickups.length < before) collected++;
    for (const k of Object.keys(w.effects)) seen.add(k);
    if (w.shopOpen) E.nextWave(w);

    assert.ok(w.pickups.length < 40, 'pickups are being reaped');
    assert.ok(w.hitStop >= 0 && w.hitStop < 0.2, 'hit-stop stays bounded');
  }
  assert.ok(collected > 0, 'the player picked something up');
  assert.ok(seen.size > 0, 'at least one effect fired');
});

test('splits still happen once power-ups are in play', () => {
  // regression: an over-wide bomb radius wiped splitters off the board
  // before the player could reach them
  const aim = (w) => {
    let best = null, bd = Infinity;
    for (const ch of w.chains) {
      for (let i = 0; i < ch.segs.length; i++) {
        const p = E.segPos(w.path, w.pathLen, ch, i);
        if (p.off) continue;
        const d = Math.hypot(p.x - w.cannon.x, p.y - w.cannon.y);
        if (d < bd) { bd = d; best = p; }
      }
    }
    if (best) w.cannon.ang = E.clampAim(Math.atan2(best.y - w.cannon.y, best.x - w.cannon.x));
  };

  const w = E.createWorld();
  w.wave = 6;
  E.spawnWave(w);
  w.lives = 99;

  let splits = 0;
  for (let i = 0; i < 60 * 120; i++) {
    aim(w);
    const before = w.chains.length;
    E.step(w, 1 / 60, true);
    if (w.chains.length > before) splits++;
    if (w.shopOpen) E.nextWave(w);
  }
  assert.ok(splits > 0, 'chains still come apart with power-ups active');
});

/* ---------- battery ---------- */

test('a new run starts with a single standard gun', () => {
  const w = E.createWorld();
  assert.equal(w.battery.guns.length, 1);
  assert.equal(w.battery.guns[0].type, 'standard');
});

test('every gun fires toward the shared aim point', () => {
  const w = E.createWorld();
  w.battery.guns.push(E.makeGun(w.L.W * 0.32));
  w.battery.guns.push(E.makeGun(w.L.W * 0.68));
  w.battery.ang = -Math.PI / 2;               // straight up

  const fired = E.fire(w);
  assert.equal(fired, 3, 'all three guns fired');
  assert.equal(w.shots.length, 3);

  // the three shots converge: their forward projections should pass near a
  // common point above the battery
  const tp = E.aimPoint(w);
  for (const s of w.shots) {
    const t = (tp.y - s.y) / s.vy;
    const xAtTarget = s.x + s.vx * t;
    assert.ok(Math.abs(xAtTarget - tp.x) < 30, 'shot heads for the aim point');
  }
});

test('guns cool independently', () => {
  const w = E.createWorld();
  w.battery.guns.push(E.makeGun(w.L.W * 0.32));
  E.fire(w);
  w.battery.guns[0].cool = 0.01;              // first gun almost ready
  E.stepCannon(w, 0.02, false);
  assert.equal(w.battery.guns[0].cool, 0, 'first gun ready');
  assert.ok(w.battery.guns[1].cool >= 0, 'second still on its own clock');
});

test('a maxed mount count cannot grow further', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  for (let i = 1; i < E.MAX_MOUNTS; i++) assert.equal(E.buyMount(w), true);
  assert.equal(w.battery.guns.length, E.MAX_MOUNTS);
  assert.equal(E.mountCost(w), null, 'no cost when full');
  assert.equal(E.buyMount(w), false);
});

test('mounts cost escalating scrap', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  const c1 = E.mountCost(w);
  E.buyMount(w);
  const c2 = E.mountCost(w);
  assert.ok(c2 > c1, 'the next mount costs more');
});

test('a mount you cannot afford is refused', () => {
  const w = E.createWorld();
  w.scrap = 0;
  assert.equal(E.buyMount(w), false);
  assert.equal(w.battery.guns.length, 1);
});

test('gun types unlock once and only when affordable', () => {
  const w = E.createWorld();
  assert.equal(w.gunUnlocks.rail, false);
  w.scrap = 0;
  assert.equal(E.unlockGun(w, 'rail'), false, 'no scrap, no unlock');

  w.scrap = E.GUN_TYPES.rail.unlock;
  assert.equal(E.unlockGun(w, 'rail'), true);
  assert.equal(w.gunUnlocks.rail, true);
  assert.equal(w.scrap, 0, 'scrap spent');
  assert.equal(E.unlockGun(w, 'rail'), false, 'cannot unlock twice');
});

test('standard is never an unlockable type', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  assert.equal(E.unlockGun(w, 'standard'), false);
});

test('a gun type can only be assigned once unlocked', () => {
  const w = E.createWorld();
  assert.equal(E.setGunType(w, 0, 'rail'), false, 'locked type refused');
  w.scrap = 1e6;
  E.unlockGun(w, 'rail');
  assert.equal(E.setGunType(w, 0, 'rail'), true);
  assert.equal(w.battery.guns[0].type, 'rail');
});

test('gun types change shot character', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  E.unlockGun(w, 'rail');
  E.setGunType(w, 0, 'rail');
  E.fire(w);
  const railShot = w.shots[w.shots.length - 1];
  assert.ok(railShot.pierce >= E.GUN_TYPES.rail.pierce, 'railgun pierces');

  const plain = E.createWorld();
  E.fire(plain);
  const stdShot = plain.shots[plain.shots.length - 1];
  assert.ok(railShot.dmg > stdShot.dmg, 'railgun hits harder than a cannon');
});

test('the autocannon fires faster but weaker than a cannon', () => {
  assert.ok(E.GUN_TYPES.auto.rate < E.GUN_TYPES.standard.rate, 'shorter cooldown');
  assert.ok(E.GUN_TYPES.auto.dmg < E.GUN_TYPES.standard.dmg, 'less per shot');
});

test('overheating one gun does not silence the whole battery', () => {
  const w = E.createWorld();
  w.battery.guns.push(E.makeGun(w.L.W * 0.32));
  w.battery.guns[0].locked = 1;               // first gun down
  const fired = E.fire(w);
  assert.equal(fired, 1, 'the other gun still fires');
});

/* ---------- convergence ---------- */

test('two guns hitting the same segment together deal bonus damage', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(10, 0, 500)];
  const sp = E.segPos(w.path, w.pathLen, w.chains[0], 3);
  const seg = w.chains[0].segs[3];
  const hp0 = seg.hp;

  // first hit
  w.shots = [{ x: sp.x, y: sp.y, vx: 0, vy: 0, dmg: 1, pierce: 0, r: 3.2, bounces: 2 }];
  E.stepShots(w, 1 / 60);
  const afterFirst = seg.hp;

  // second hit within the convergence window
  w.battery.clock += E.CONVERGE_WINDOW * 0.5;
  w.shots = [{ x: sp.x, y: sp.y, vx: 0, vy: 0, dmg: 1, pierce: 0, r: 3.2, bounces: 2 }];
  E.stepShots(w, 1 / 60);
  const secondHitDamage = afterFirst - seg.hp;

  assert.ok(secondHitDamage > 1, `focused hit dealt ${secondHitDamage.toFixed(2)}, expected > 1`);
});

test('hits outside the window are not focused', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(10, 0, 500)];
  const sp = E.segPos(w.path, w.pathLen, w.chains[0], 3);
  const seg = w.chains[0].segs[3];

  w.shots = [{ x: sp.x, y: sp.y, vx: 0, vy: 0, dmg: 1, pierce: 0, r: 3.2, bounces: 2 }];
  E.stepShots(w, 1 / 60);
  const afterFirst = seg.hp;

  w.battery.clock += E.CONVERGE_WINDOW * 2;     // too late
  E.stepCannon(w, E.CONVERGE_WINDOW * 2, false); // expires the record
  w.shots = [{ x: sp.x, y: sp.y, vx: 0, vy: 0, dmg: 1, pierce: 0, r: 3.2, bounces: 2 }];
  E.stepShots(w, 1 / 60);

  assert.ok(Math.abs((afterFirst - seg.hp) - 1) < 1e-6, 'plain damage, no bonus');
});

test('resetting a run restores a single standard gun', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  E.buyMount(w); E.buyMount(w);
  E.unlockGun(w, 'rail');
  E.setGunType(w, 0, 'rail');
  E.resetRun(w);
  assert.equal(w.battery.guns.length, 1);
  assert.equal(w.battery.guns[0].type, 'standard');
  assert.equal(w.gunUnlocks.rail, false);
});

/* ---------- overdrive ---------- */

test('streak thresholds map to the right tier', () => {
  assert.equal(E.tierForStreak(0), 0);
  assert.equal(E.tierForStreak(2), 0);
  assert.equal(E.tierForStreak(3), 1);
  assert.equal(E.tierForStreak(7), 2);
  assert.equal(E.tierForStreak(12), 3);
  assert.equal(E.tierForStreak(50), 3, 'tier is capped');
});

test('each tier fires faster than the last', () => {
  for (let i = 1; i < E.OD_TIERS.length; i++) {
    assert.ok(E.OD_TIERS[i].rate < E.OD_TIERS[i - 1].rate);
  }
});

test('consecutive hits climb into overdrive', () => {
  const w = E.createWorld();
  for (let i = 0; i < 3; i++) E.registerHit(w);
  assert.equal(w.cannon.od, 1);
  for (let i = 0; i < 4; i++) E.registerHit(w);
  assert.equal(w.cannon.od, 2);
});

test('a miss clears the streak and drops one tier', () => {
  const w = E.createWorld();
  for (let i = 0; i < 12; i++) E.registerHit(w);
  assert.equal(w.cannon.od, 3);
  E.registerMiss(w);
  assert.equal(w.cannon.od, 2, 'drops one tier, not to zero');
  assert.equal(w.cannon.streak, 0);
});

test('overdrive cannot go below zero on repeated misses', () => {
  const w = E.createWorld();
  for (let i = 0; i < 5; i++) E.registerMiss(w);
  assert.equal(w.cannon.od, 0);
});

/* ---------- heat and firing ---------- */

test('firing respects the cooldown', () => {
  const w = E.createWorld();
  assert.equal(E.fire(w), 1, 'first shot goes out');
  assert.equal(E.fire(w), 0, 'second is blocked by cooldown');
  E.stepCannon(w, 0.5, false);
  assert.equal(E.fire(w), 1, 'fires again once cool');
});

test('sustained fire overheats and locks the barrel', () => {
  const w = E.createWorld();
  for (let i = 0; i < 60; i++) {
    E.fire(w);
    E.stepCannon(w, E.OD_TIERS[w.battery.od].rate, false);
    if (gun0(w).locked > 0) break;
  }
  assert.ok(gun0(w).locked > 0, 'barrel locked');
  assert.equal(E.fire(w), 0, 'cannot fire while locked');
});

test('a locked barrel cools faster than a hot one', () => {
  assert.ok(E.HEAT_COOL_LOCKED > E.HEAT_COOL);
});

test('heat bleeds off over time', () => {
  const w = E.createWorld();
  E.fire(w);
  const hot = gun0(w).heat;
  E.stepCannon(w, 0.2, false);
  assert.ok(gun0(w).heat < hot);
  E.stepCannon(w, 100, false);
  assert.equal(gun0(w).heat, 0, 'never goes negative');
});

test('shots inherit damage and pierce from the current tier', () => {
  const w = E.createWorld();
  w.battery.od = 3;
  E.fire(w);
  const shot = w.shots[w.shots.length - 1];
  assert.ok(shot.dmg >= E.OD_TIERS[3].dmg, 'overdrive damage applied');
  assert.ok(shot.pierce >= E.OD_TIERS[3].pierce, 'overdrive pierce applied');
});

/* ---------- aiming ---------- */

test('aim is clamped above the horizon on both sides', () => {
  assert.equal(E.clampAim(-Math.PI), E.AIM_MIN);
  assert.equal(E.clampAim(0), E.AIM_MAX);
  assert.equal(E.clampAim(-Math.PI / 2), -Math.PI / 2, 'straight up is untouched');
});

/* ---------- projectiles ---------- */

test('shots reflect off the side walls', () => {
  const w = E.createWorld();
  w.shots = [{ x: 10, y: 300, vx: -500, vy: 0, dmg: 1, pierce: 0, r: 3.2 }];
  E.stepShots(w, 0.05);
  assert.ok(w.shots[0].vx > 0, 'horizontal velocity flipped');
  assert.ok(w.shots[0].x >= 6);
});

test('a shot leaving the top counts as a miss', () => {
  const w = E.createWorld();
  w.cannon.streak = 5; w.cannon.od = 1;
  w.shots = [{ x: 400, y: -10, vx: 0, vy: -500, dmg: 1, pierce: 0, r: 3.2 }];
  E.stepShots(w, 0.05);
  assert.equal(w.shots.length, 0);
  assert.equal(w.cannon.streak, 0);
});

test('a shot on target damages a segment and is consumed', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(8, 0, 500)];
  const target = E.segPos(path, pathLen, w.chains[0], 3);
  w.shots = [{ x: target.x, y: target.y, vx: 0, vy: 0, dmg: 1, pierce: 0, r: 3.2 }];

  E.stepShots(w, 1 / 60);
  assert.equal(w.shots.length, 0, 'shot consumed');
  assert.equal(w.cannon.streak, 1, 'hit registered');
});

test('a piercing shot survives its first hit', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(8, 0, 500)];
  const target = E.segPos(path, pathLen, w.chains[0], 3);
  w.shots = [{ x: target.x, y: target.y, vx: 0, vy: 0, dmg: 1, pierce: 1, r: 3.2 }];

  E.stepShots(w, 1 / 60);
  assert.equal(w.shots.length, 1, 'shot lives on');
  assert.equal(w.shots[0].pierce, 0, 'pierce spent');
});

/* ---------- breach and lives ---------- */

test('no breach while the chain is still up the path', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(8, 40, 300)];
  assert.equal(E.checkBreach(w), false);
});

test('breach fires when a segment crosses the floor line', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(8, 40, pathLen - 5)];
  // walk the chain down until something crosses
  for (let i = 0; i < 600 && !E.checkBreach(w); i++) E.stepChains(w, 1 / 60);
  assert.equal(E.checkBreach(w), true);
});

test('a breach costs a life and restarts the wave', () => {
  const w = E.createWorld();
  E.spawnWave(w);
  E.breach(w);
  assert.equal(w.lives, 2);
  assert.equal(w.chains.length, 1, 'wave respawned');
  assert.equal(w.cannon.od, 0, 'overdrive reset');
});

test('the run ends when the last life is spent', () => {
  const w = E.createWorld();
  E.spawnWave(w);
  E.breach(w); E.breach(w); E.breach(w);
  assert.equal(w.lives, 0);
  assert.equal(w.over, true);
  assert.equal(w.running, false);
});

/* ---------- wave flow ---------- */

test('clearing every chain opens the shop after a beat', () => {
  const w = E.createWorld();
  E.spawnWave(w);
  w.running = true;
  w.chains = [];

  E.step(w, 1 / 60);
  assert.equal(w.waveClear, true);
  assert.equal(w.shopOpen, false, 'not instant');

  for (let i = 0; i < 120; i++) E.step(w, 1 / 60);
  assert.equal(w.shopOpen, true, 'shop opened');
  assert.equal(w.running, false, 'simulation paused for shopping');
  assert.equal(w.wave, 1, 'wave only advances on leaving the shop');
});

test('leaving the shop starts the next wave', () => {
  const w = E.createWorld();
  E.spawnWave(w);
  w.shopOpen = true;
  E.nextWave(w);
  assert.equal(w.wave, 2);
  assert.equal(w.shopOpen, false);
  assert.equal(w.running, true);
  assert.ok(w.chains.length > 0, 'next wave spawned');
});

test('clearing a wave pays a bonus', () => {
  const w = E.createWorld();
  E.spawnWave(w);
  w.chains = [];
  const before = w.score;
  E.step(w, 1 / 60);
  assert.ok(w.score > before, 'wave clear is rewarded');
});

test('resetRun clears every run-scoped value', () => {
  const w = E.createWorld();
  w.wave = 9; w.score = 500; w.scrap = 40; w.lives = 1;
  w.over = true; w.cannon.od = 3; w.cannon.streak = 20;

  E.resetRun(w);
  assert.deepEqual(
    { wave: w.wave, score: w.score, scrap: w.scrap, lives: w.lives, over: w.over },
    { wave: 1, score: 0, scrap: 0, lives: 3, over: false },
  );
  assert.equal(w.cannon.od, 0);
  assert.equal(w.cannon.streak, 0);
});

/* ---------- integration ---------- */

test('an idle world eventually breaches without ever crashing', () => {
  const w = E.createWorld();
  E.spawnWave(w);
  for (let i = 0; i < 60 * 60; i++) E.step(w, 1 / 60);
  assert.ok(w.breaches > 0, 'the snake got through');
});

test('a long run with constant fire stays internally consistent', () => {
  const w = E.createWorld();
  E.spawnWave(w);
  for (let i = 0; i < 60 * 45; i++) {
    w.cannon.ang = E.clampAim(-Math.PI / 2 + Math.sin(i / 40) * 1.1);
    E.step(w, 1 / 60, true);

    assert.ok(w.battery.guns.every(g => g.heat >= 0 && g.heat <= 1), 'heat in range');
    assert.ok(w.battery.od >= 0 && w.battery.od < E.OD_TIERS.length, 'tier in range');
    assert.ok(w.shots.length < 400, 'shots are being reaped');
    for (const ch of w.chains) {
      assert.ok(ch.segs.length > 0, 'no empty chains linger');
      assert.ok(ch.recoil >= 0, 'recoil never goes negative');
    }
  }
  assert.ok(w.score > 0, 'the player scored');
});

test('splits happen during real play and stay within the cap', () => {
  const w = E.createWorld();
  w.wave = 6;              // long enough chains to contain splitters
  E.spawnWave(w);
  w.lives = 99;

  let splits = 0, maxChains = 1;
  for (let i = 0; i < 60 * 120; i++) {
    w.cannon.ang = E.clampAim(-Math.PI / 2 + Math.sin(i / 29) * 1.2);
    const before = w.chains.length;
    E.step(w, 1 / 60, true);
    if (w.chains.length > before) splits++;
    maxChains = Math.max(maxChains, w.chains.length);

    assert.ok(w.chains.length <= E.MAX_CHAINS, 'chain cap held');
    for (const ch of w.chains) {
      assert.ok(ch.segs.length > 0, 'no empty chains linger');
      assert.ok(ch.recoil >= 0, 'recoil never goes negative');
      for (const s of ch.segs) assert.ok(s.hp <= s.maxhp + 1e-9, 'no overheal');
    }
  }
  assert.ok(splits > 0, 'the chain came apart at least once');
});

test('the world model holds a list of chains, ready for splitters', () => {
  const w = E.createWorld();
  w.chains = [E.makeChain(6, 40, 400), E.makeChain(6, 40, 200)];
  E.step(w, 1 / 60);
  assert.equal(w.chains.length, 2, 'both chains simulate independently');
});
