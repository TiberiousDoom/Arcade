import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.js';

/** The first wave on which every segment kind is unlocked. Most tests below are
 *  about how a *kind* behaves, so they need a chain that actually contains the
 *  interesting ones — wave 1 is deliberately nothing but `std` now. */
const ALL_KINDS = Math.max(...Object.values(E.KIND_UNLOCK));

/** Build a chain with every kind available but hp left at `KIND`'s published
 *  numbers, so assertions can use those directly and stay independent of the
 *  per-wave hp curve (which has its own tests). */
function chain(count, speed, s, wave = ALL_KINDS, spacing = 30) {
  const ch = E.makeChain(count, speed, s, spacing, wave);
  for (const seg of ch.segs) {
    const base = E.KIND[seg.kind].hp;
    seg.hp = base; seg.maxhp = base;
  }
  return ch;
}

/** The first emplacement. Upgrades are per-gun since v27, so anything that used
 *  to read `w.upgrades` now has to say which mount it means; most of these
 *  tests only ever have one. */
const gun0 = (w) => w.battery.guns[0];

/** Research a gun type outright, for tests that only want it *fitted*. Gun
 *  types cost research points rather than scrap since v28. */
function learn(w, type) {
  w.research.points += E.GUN_RP[type];
  E.researchGun(w, type);
}

/** Open every branch to its last tier, for tests about the tiers themselves
 *  rather than about the research gate. Tiers 4 and 5 need research now. */
function openTree(w) {
  w.research.points += 1e6;
  for (const b of E.BRANCHES) while (E.researchDepth(w, b)) { /* to the cap */ }
  return w;
}

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
  const ch = chain(12, 50, 0);
  assert.equal(ch.segs[0].kind, 'head');
  assert.equal(ch.segs.length, 12);
});

test('segment kinds are assigned deterministically', () => {
  const a = chain(20, 50, 0).segs.map(s => s.kind);
  const b = chain(20, 50, 0).segs.map(s => s.kind);
  assert.deepEqual(a, b);
  assert.ok(a.includes('armored'));
  assert.ok(a.includes('volatile'));
});

/* ---------- difficulty curve: unlocks, hp, length ---------- */

test('wave 1 is nothing but a head and standard segments', () => {
  // the whole point of the unlock schedule: wave 1 used to ship armored,
  // volatile, shielded, regen, carrier and a splitter all at once
  const kinds = E.makeChain(E.waveCount(1), 50, 0, 30, 1).segs.map(s => s.kind);
  assert.equal(kinds[0], 'head');
  assert.deepEqual([...new Set(kinds.slice(1))], ['std'], 'body is entirely std');
});

test('kinds unlock one at a time as waves pass', () => {
  let prev = E.kindsForWave(1);
  assert.deepEqual(prev, ['std'], 'only std to begin with');
  for (let wave = 2; wave <= 12; wave++) {
    const now = E.kindsForWave(wave);
    for (const k of prev) assert.ok(now.includes(k), `wave ${wave} keeps ${k}`);
    prev = now;
  }
  const all = E.kindsForWave(ALL_KINDS);
  for (const k of Object.keys(E.KIND_UNLOCK)) assert.ok(all.includes(k), `${k} eventually unlocks`);
  // every unlockable kind is a real KIND, and head is not one of them
  for (const k of all) assert.ok(E.KIND[k], `${k} exists in KIND`);
  assert.ok(!all.includes('head'), 'head is not a body kind');
});

test('a kind never appears before its unlock wave', () => {
  for (const [kind, unlock] of Object.entries(E.KIND_UNLOCK)) {
    for (let wave = 1; wave < unlock; wave++) {
      const kinds = E.makeChain(56, 50, 0, 30, wave).segs.map(s => s.kind);
      assert.ok(!kinds.includes(kind), `${kind} must not show up on wave ${wave}`);
    }
    const at = E.makeChain(56, 50, 0, 30, unlock).segs.map(s => s.kind);
    assert.ok(at.includes(kind), `${kind} appears once wave ${unlock} arrives`);
  }
});

test('kind assignment is still deterministic for a given wave', () => {
  const a = E.makeChain(20, 50, 0, 30, ALL_KINDS).segs.map(s => s.kind);
  const b = E.makeChain(20, 50, 0, 30, ALL_KINDS).segs.map(s => s.kind);
  assert.deepEqual(a, b);
  assert.ok(a.includes('armored'));
  assert.ok(a.includes('volatile'));
});

test('segment hp climbs with the wave and then caps', () => {
  assert.equal(E.hpScale(1), 1, 'wave 1 is the published KIND numbers');
  assert.ok(E.hpScale(5) > E.hpScale(1), 'and it climbs');
  assert.ok(E.hpScale(10) > E.hpScale(5));
  assert.equal(E.hpScale(999), E.HP_SCALE_MAX, 'capped, so segments never outlast the wave');
  assert.ok(E.hpScale(999) >= E.hpScale(50), 'monotonic up to the cap');
});

test('a later wave really is tougher per segment, not just longer', () => {
  const one = E.makeChain(20, 50, 0, 30, 1).segs;
  const ten = E.makeChain(20, 50, 0, 30, 10).segs;
  assert.ok(ten[0].maxhp > one[0].maxhp, 'the head is tougher');
  // compare like with like: a std segment against a std segment
  const stdOf = (segs) => segs.find((s, i) => i > 0 && s.kind === 'std');
  assert.ok(stdOf(ten).maxhp > stdOf(one).maxhp, 'and so is a plain segment');
  // hp and maxhp must move together or hp bars and the hit-stop thresholds lie
  for (const s of ten) assert.equal(s.hp, s.maxhp, 'segments spawn at full health');
});

test('the hp cap does not make late waves unwinnable', () => {
  // The risk of scaling hp is a wall: a wave whose total health cannot be
  // chewed through before it crosses, no matter how upgraded you are. A fully
  // maxed battery with perfect aim must still clear deep waves untouched.
  const w = openTree(E.createWorld());
  w.lives = 999; w.scrap = 1e9;
  // Mounts first, *then* max every branch on every one of them. Upgrades are
  // per-emplacement since v27, so buying the tree before the mounts leaves the
  // new arrivals bare — which is the intended balance, but it is not what this
  // test means by "fully maxed".
  while (E.buyMount(w));
  /* Every branch except convergence. This test asks whether the hp curve can be
     out-*damaged*; convergence does not add damage, it redistributes it —
     concentrating the battery's fan onto fewer craft, which is measurably more
     score and measurably more leaks. Including it here would be testing a
     playstyle rather than the damage ceiling. */
  for (let m = 0; m < w.battery.guns.length; m++) {
    for (const b of E.BRANCHES) {
      if (b === 'convergence') continue;
      while (E.buyUpgrade(w, m, b));
    }
  }

  const aim = () => {
    let best = null, bd = Infinity;
    for (const ch of w.chains) {
      for (let i = 0; i < ch.segs.length; i++) {
        if (i === 0 && ch.segs.length > 1) continue;   // head is body-armoured
        const p = E.segPos(w.path, w.pathLen, ch, i);
        if (p.off) continue;
        const d = Math.hypot(p.x - w.cannon.x, p.y - w.cannon.y);
        if (d < bd) { bd = d; best = p; }
      }
    }
    if (best) w.cannon.ang = E.clampAim(Math.atan2(best.y - w.cannon.y, best.x - w.cannon.x));
  };

  for (let f = 0; f < 60 * 60 * 8 && w.wave < 20; f++) {
    aim();
    E.step(w, 1 / 60, true);
    if (w.shopOpen) E.nextWave(w);
  }
  assert.ok(w.wave >= 20, `stalled at wave ${w.wave} — the hp curve outran the damage ceiling`);
  assert.equal(w.breaches, 0, 'and did it without a single breach');
});

test('the hp curve keeps climbing past wave 7, where the chain length caps', () => {
  /* The reported cliff: `waveCount` reaches its 78-craft ceiling at wave 7, so
     from there the column stops getting longer — and length is the escalation
     a player can see. The compensating climb has to come from somewhere. */
  assert.equal(E.waveCount(7), E.waveCount(12), 'length really does cap by wave 7');

  const rise = (a, b) => (E.hpScale(b) - E.hpScale(a)) / (b - a);
  assert.ok(rise(8, 14) > rise(1, 7),
    'health climbs faster after the length cap than before it, not slower');
  // and it does not simply flatten at the ceiling a few waves later
  assert.ok(E.hpScale(18) > E.hpScale(14), 'still rising at 18');
});

test('a wave is one column, however deep the run goes', () => {
  // Splitting a wave across columns was tried and rejected — see the note by
  // hpScale. Splitters still make extra chains mid-wave; the spawn does not.
  for (const wave of [1, 7, 12, 20]) {
    const w = E.createWorld();
    w.wave = wave;
    E.spawnWave(w);
    assert.equal(w.chains.length, 1, `wave ${wave} spawned ${w.chains.length} chains`);
    assert.equal(w.chains[0].segs.length, E.waveCount(wave), 'and it holds the whole wave');
  }
});

test('waves get longer as well as tougher', () => {
  assert.ok(E.waveCount(5) > E.waveCount(1));
  assert.ok(E.waveCount(10) > E.waveCount(5), 'still climbing past the old wave-9 flatline');
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
  // Row COUNT must match, or the serpentine's alternating directions put a
  // segment at the same path fraction into a row running the opposite way, and
  // the map visibly flips when the phone is turned. Real-device regression.
  assert.equal(T.ROWS, L.ROWS, 'same row count, so the path keeps its shape');
  assert.ok(T.ROW_GAP > L.ROW_GAP, 'the extra height goes into row spacing instead');
});

test('a segment sits the same way round on either board', () => {
  // the regression behind "the map reverses on rotate"
  const a = E.buildPath(E.LAYOUT), b = E.buildPath(E.LAYOUT_TALL);
  for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const ha = E.segHeading(a.path, a.pathLen, { s: a.pathLen * frac, spacing: 30 }, 0);
    const hb = E.segHeading(b.path, b.pathLen, { s: b.pathLen * frac, spacing: 30 }, 0);
    assert.ok(Math.sign(ha.x) === Math.sign(hb.x) || Math.abs(ha.x) < 0.3 || Math.abs(hb.x) < 0.3,
      `at ${frac} of the path the boards disagree on direction (${ha.x.toFixed(2)} vs ${hb.x.toFixed(2)})`);
  }
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
  assert.ok(E.waveCount(99) > E.waveCount(5), 'and caps somewhere above the early waves');
  assert.equal(E.waveCount(200), E.waveCount(99), 'the cap really is a cap');
});

test('a maxed chain still fits the board it is actually played on', () => {
  /* The length cap is a geometry limit: the tail must not still be entering
     while the head is at the floor. Measured against the *portrait* path,
     since the game has been portrait-only since 2026-07-27 — the landscape
     REF_PATH_LEN is longer and would flatter the numbers. Derived from the
     live constants so raising either one trips this rather than shipping a
     chain that laps itself. */
  const portrait = E.buildPath(E.LAYOUT_TALL).pathLen;
  const span = E.waveCount(999) * E.SEGMENT_SPACING;
  assert.ok(span < portrait * 0.85,
    `maxed chain spans ${span.toFixed(0)} of a ${portrait.toFixed(0)} path`);
});

test('segments trail the head by one spacing each', () => {
  const ch = chain(4, 0, 400);
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

test('recoil was softened — a near-head cut no longer costs as much blowback', () => {
  // pins the reduction itself, not just the shape: feedback said the
  // penalty read as too punishing. Worst case (cut right behind the head)
  // used to be spacing*2.7; it should now be meaningfully less.
  const worstCase = E.recoilGain(30, 9, 10);
  assert.ok(worstCase < 30 * 2.7 * 0.75, 'the worst-case cut costs noticeably less than before');
});

test('recoil is zero when nothing remains to link up', () => {
  assert.equal(E.recoilGain(30, 5, 0), 0);
});

test('destroying a mid segment pushes the chain backward', () => {
  const w = E.createWorld();
  w.chains = [chain(10, 40, 500)];
  const before = w.chains[0].s;

  const seg = w.chains[0].segs[5];
  E.damageSeg(w, 0, 5, seg.hp);

  assert.ok(w.chains[0].recoil > 0, 'recoil debt accrued');
  E.stepChains(w, 0.5);
  assert.ok(w.chains[0].s < before, 'chain actually moved back');
});

test('recoil is paid off, then forward motion resumes', () => {
  const w = E.createWorld();
  w.chains = [chain(10, 40, 500)];
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
  w.chains = [chain(6, 0, 400)];
  const before = w.chains[0].segs.length;

  assert.equal(E.damageSeg(w, 0, 1, 1), false);
  assert.equal(w.chains[0].segs.length, before, 'survives a chip');
  assert.equal(E.damageSeg(w, 0, 1, 99), true, 'dies on a lethal hit');
  assert.equal(w.chains[0].segs.length, before - 1);
});

test('volatile segments splash their neighbours', () => {
  const w = E.createWorld();
  w.chains = [chain(20, 0, 600)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'volatile');
  assert.ok(idx > 0, 'fixture contains a volatile segment');

  const neighbourHpBefore = w.chains[0].segs[idx + 1].hp;
  E.damageSeg(w, 0, idx, E.KIND.volatile.hp);
  // after the splice, the old idx+1 sits at idx
  assert.ok(w.chains[0].segs[idx].hp < neighbourHpBefore, 'neighbour took splash');
});

test('kills award score and scrap', () => {
  const w = E.createWorld();
  w.chains = [chain(6, 0, 400)];
  E.damageSeg(w, 0, 1, 99);
  assert.equal(w.score, E.KIND.std.score);
  assert.equal(w.scrap, E.KIND.std.scrap);
});

test('emptying a chain removes it from the world', () => {
  const w = E.createWorld();
  w.chains = [chain(1, 0, 400)];
  E.damageSeg(w, 0, 0, 99);
  assert.equal(w.chains.length, 0);
});

/* ---------- saving a run in progress ---------- */

test('a snapshot round-trips a run exactly', () => {
  const w = E.createWorld();
  w.running = true;
  w.wave = 4; E.spawnWave(w);
  w.score = 7700; w.scrap = 55; w.lives = 2; w.breaches = 1;
  E.buyUpgrade(w, 0, 'damage');
  learn(w, 'rail');
  E.setGunType(w, 0, 'rail', true);      // free: this is about the save, not the economy
  w.cannon.streak = 6;
  E.spawnPickup(w, 300, 400, 'spread');
  for (let i = 0; i < 90; i++) E.step(w, 1 / 60, true);

  const snap = JSON.parse(JSON.stringify(E.snapshot(w)));
  const fresh = E.createWorld();
  assert.equal(E.hydrate(fresh, snap), true);

  assert.equal(fresh.wave, w.wave);
  assert.equal(fresh.score, w.score);
  assert.equal(fresh.scrap, w.scrap);
  assert.equal(fresh.lives, w.lives);
  assert.equal(fresh.breaches, w.breaches);
  assert.deepEqual(fresh.battery.guns.map(g => g.upgrades),
                   w.battery.guns.map(g => g.upgrades),
                   'each emplacement brought its own tiers back');
  /* Gun unlocks deliberately do *not* round-trip: they are a projection of
     permanent research, which the shell holds, not part of the run. What must
     come back is the gun actually fitted to the mount, and it does. */
  assert.equal(fresh.battery.guns[0].type, 'rail', 'the fitted gun came back');
  assert.equal(fresh.gunUnlocks.rail, false,
    'but the save did not smuggle research in with it');
  assert.equal(fresh.battery.guns.length, w.battery.guns.length, 'mounts came back');
  assert.deepEqual(fresh.battery.guns.map(g => g.type), w.battery.guns.map(g => g.type));
  assert.equal(fresh.chains.length, w.chains.length);
  assert.deepEqual(fresh.chains[0].segs.map(s => `${s.kind}:${s.hp}`),
                   w.chains[0].segs.map(s => `${s.kind}:${s.hp}`), 'every segment kept its damage');
  assert.equal(fresh.pickups.length, w.pickups.length, 'falling pickups came back');
  assert.equal(fresh.cannon, fresh.battery, 'the cannon alias was re-established');
});

test('a restored run keeps playing identically', () => {
  const w = E.createWorld();
  w.running = true;
  for (let i = 0; i < 300; i++) E.step(w, 1 / 60, true);

  const resumed = E.createWorld();
  resumed.running = true;
  E.hydrate(resumed, JSON.parse(JSON.stringify(E.snapshot(w))));
  for (let i = 0; i < 400; i++) { E.step(w, 1 / 60, true); E.step(resumed, 1 / 60, true); }
  assert.equal(resumed.score, w.score, 'same score after playing on');
  assert.equal(resumed.lives, w.lives, 'same lives');
  assert.equal(resumed.wave, w.wave, 'same wave');
});

test('restored segment ids cannot collide with newly minted ones', () => {
  // lastHitAt is keyed by segment id, so a reused id would hand a brand-new
  // segment a stranger's convergence timing
  const w = E.createWorld();
  w.wave = 3; E.spawnWave(w);
  const maxId = Math.max(...w.chains[0].segs.map(s => s.id));
  const snap = JSON.parse(JSON.stringify(E.snapshot(w)));

  const fresh = E.createWorld();          // its own segs restarted the counter low
  E.hydrate(fresh, snap);
  const restoredIds = new Set(fresh.chains.flatMap(ch => ch.segs.map(s => s.id)));
  // spawn more and check none of them reuse a restored id
  fresh.wave = 5; E.spawnWave(fresh);
  E.hydrate(fresh, snap);
  const after = E.nextSegId();
  assert.ok(after > maxId, `next id ${after} must clear the restored max ${maxId}`);
  for (let i = 0; i < 20; i++) assert.ok(!restoredIds.has(E.nextSegId()), 'no reuse');
});

test('in-flight shots and particles do not survive a save', () => {
  const w = E.createWorld();
  w.running = true;
  for (let i = 0; i < 60; i++) E.step(w, 1 / 60, true);
  assert.ok(w.shots.length > 0, 'setup: shots are in the air');
  const fresh = E.createWorld();
  E.hydrate(fresh, JSON.parse(JSON.stringify(E.snapshot(w))));
  assert.deepEqual(fresh.shots, [], 'shots would resume mid-trajectory, so they are dropped');
  assert.deepEqual(fresh.bits, []);
  assert.deepEqual(fresh.floaters, []);
});

test('aim assist is not carried across devices by a save', () => {
  // assistR describes the input device, not the run: a phone save restored on
  // a desktop must not bring the touch forgiveness with it
  const touch = E.createWorld({ assist: true });
  touch.running = true;
  const snap = JSON.parse(JSON.stringify(E.snapshot(touch)));
  assert.equal('assistR' in snap, false, 'not stored');
  const mouse = E.createWorld({ assist: false });
  E.hydrate(mouse, snap);
  assert.equal(mouse.assistR, 0, 'the desktop world kept its own setting');
});

test('a corrupt or foreign snapshot is refused rather than half-applied', () => {
  const good = E.snapshot(E.createWorld());
  for (const bad of [
    null, undefined, 3, 'nope', {},
    { ...good, chains: 'not an array' },
    { ...good, wave: 'five' },
    { ...good, chains: [{ s: 0, segs: [{ id: 1, kind: 'kraken', hp: 1, maxhp: 1, r: 5 }] }] },
    { ...good, battery: { ...good.battery, guns: [{ x: 0, type: 'deathray' }] } },
  ]) {
    const w = E.createWorld();
    const before = JSON.stringify(E.snapshot(w));
    assert.equal(E.hydrate(w, bad), false, `should have refused: ${String(JSON.stringify(bad)).slice(0, 50)}`);
    assert.equal(JSON.stringify(E.snapshot(w)), before, 'and changed nothing');
  }
});

/* ---------- the head: armoured by its body, lethal when it falls ---------- */

test('the head takes a fraction of normal damage while a body remains', () => {
  assert.equal(E.headDamageFactor(0), 1, 'exposed head takes full damage');
  assert.ok(E.headDamageFactor(30) < E.headDamageFactor(5), 'a longer body protects more');
  assert.ok(E.headDamageFactor(5) < 1, 'and any body at all protects some');
  // the whole reason this exists: the head is the closest, most exposed target,
  // so an unprotected instant-kill head would be the easiest shot on the board
  assert.ok(E.headDamageFactor(30) < 0.05, 'a full-length chain makes the head near-immune');
});

test('shooting the head of a full chain barely scratches it', () => {
  const w = E.createWorld();
  w.chains = [chain(30, 0, 1200)];
  const head = w.chains[0].segs[0];
  const hp0 = head.hp;
  E.damageSeg(w, 0, 0, 5);
  assert.ok(head.hp > hp0 - 5, 'damage was scaled down');
  assert.ok(head.hp > 0, 'and it survived comfortably');
  assert.equal(w.chains.length, 1, 'chain still there');
});

test('killing an exposed head destroys the whole chain and scores it', () => {
  const w = E.createWorld();
  w.chains = [chain(1, 0, 1200)];        // head alone: fully exposed
  const before = w.score;
  const died = E.damageSeg(w, 0, 0, 999);
  assert.equal(died, true);
  assert.equal(w.chains.length, 0, 'chain gone');
  assert.ok(w.score > before, 'and it paid out');
});

test('decapitation pays for every segment still on the chain', () => {
  // a body still attached is worth something, so the gamble has a real prize
  const w = E.createWorld();
  w.chains = [chain(12, 0, 1200)];
  const segs = w.chains[0].segs;
  const expected = segs.reduce((sum, s) => sum + E.KIND[s.kind].score, 0);
  const scrap = segs.reduce((sum, s) => sum + E.KIND[s.kind].scrap, 0);
  const s0 = w.score, c0 = w.scrap;
  E.damageSeg(w, 0, 0, 1e9);            // enough to punch through the penalty
  assert.equal(w.chains.length, 0, 'the body died with the head');
  assert.equal(w.score - s0, expected, 'every segment scored');
  assert.equal(w.scrap - c0, scrap, 'and paid scrap');
});

test('an early decapitation is possible but costs far more damage', () => {
  // the risk/reward shape: the same kill is available either way, but taking
  // it early has to be paid for in burst damage. A one-shot dmg (above every
  // non-head kind's hp) keeps each body hit a clean single kill; tracking the
  // original chain by reference (not by index) means a splitter's split — a
  // second, independent chain appended after it — never gets folded into
  // either total, which index-0 bookkeeping alone doesn't protect against.
  const maxNonHeadHp = Math.max(...Object.keys(E.KIND).filter(k => k !== 'head').map(k => E.KIND[k].hp));
  const DMG = maxNonHeadHp + 5;
  const straightAway = (() => {
    const w = E.createWorld();
    const ch = chain(20, 0, 1200);
    w.chains = [ch];
    let spent = 0;
    while (w.chains.includes(ch) && spent < 1e6) { E.damageSeg(w, 0, 0, DMG); spent += DMG; }
    return spent;
  })();
  const bodyFirst = (() => {
    const w = E.createWorld();
    const ch = chain(20, 0, 1200);
    w.chains = [ch];
    let spent = 0;
    // clear the body from the back, then the head — only ever targeting the
    // original chain's own segments/index, ignoring anything a split spun off
    while (w.chains.includes(ch) && ch.segs.length > 1 && spent < 1e6) {
      E.damageSeg(w, w.chains.indexOf(ch), ch.segs.length - 1, DMG); spent += DMG;
    }
    while (w.chains.includes(ch) && spent < 1e6) {
      E.damageSeg(w, w.chains.indexOf(ch), 0, DMG); spent += DMG;
    }
    return spent;
  })();
  assert.ok(straightAway > bodyFirst, `head-first cost ${straightAway}, body-first ${bodyFirst}`);
});

test('a head grown by a split is armoured by its own new body', () => {
  const w = E.createWorld();
  w.wave = ALL_KINDS;
  E.spawnWave(w);
  // find and kill a splitter to grow a second head
  const ch = w.chains[0];
  const si = ch.segs.findIndex(s => s.kind === 'splitter');
  assert.ok(si > 0, 'the wave contains a splitter');
  E.damageSeg(w, 0, si, 999);
  assert.equal(w.chains.length, 2, 'it split');
  const tail = w.chains[1];
  assert.equal(tail.segs[0].kind, 'head');
  const hp0 = tail.segs[0].hp;
  E.damageSeg(w, 1, 0, 5);
  assert.ok(tail.segs[0].hp > hp0 - 5, 'the new head is protected too');
});

test('damageSeg is safe on indices that no longer exist', () => {
  const w = E.createWorld();
  w.chains = [chain(3, 0, 400)];
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

/* ---------- per-input corrections: assist and traverse ---------- */

test('touch aim assist widens the hit radius; mouse and keyboard get none', () => {
  assert.equal(E.createWorld({ assist: true }).assistR, E.AIM_ASSIST_R);
  assert.equal(E.createWorld({ assist: false }).assistR, 0);
  assert.equal(E.createWorld().assistR, 0, 'off unless asked for');
});

test('a near miss connects with assist on and misses without it', () => {
  // one shot placed just outside the segment's true radius, fired into an
  // otherwise identical world twice — the only difference is the assist
  const shotAt = (assist) => {
    const w = E.createWorld({ assist });
    E.spawnWave(w);
    const ch = w.chains[0];
    ch.s = w.pathLen * 0.5;      // a fresh chain starts off-board; put it on-path
    ch.segs.length = 1;          // and trim it: the path folds back near itself
                                 // at mid-length, so a trailing segment would
                                 // otherwise be the thing the shot lands on
    const sp = E.segPos(w.path, w.pathLen, ch, 0);
    const seg = ch.segs[0];
    const hp0 = seg.hp;
    // offset by more than seg.r + shot r, but less than that plus the assist
    const gap = seg.r + 4 + E.AIM_ASSIST_R * 0.5;
    w.shots.push({ x: sp.x + gap, y: sp.y, vx: 0, vy: 0, r: 4, dmg: 1, pierce: 0, bounces: 2 });
    E.stepShots(w, 1 / 600);
    return w.chains[0] && w.chains[0].segs[0] ? w.chains[0].segs[0].hp < hp0 : true;
  };
  assert.equal(shotAt(true), true, 'assist turns the near miss into a hit');
  assert.equal(shotAt(false), false, 'without assist it sails past');
});

test('traverse caps how fast the battery can swing', () => {
  const span = E.AIM_MAX - E.AIM_MIN;
  // asked to cross the whole arc in one frame, it moves only its rate
  const after = E.slewAim(E.AIM_MIN, E.AIM_MAX, 1 / 60);
  assert.ok(after - E.AIM_MIN <= E.TRAVERSE_MAX / 60 + 1e-9, 'did not teleport');
  assert.ok(after < E.AIM_MAX, 'still short of the target');
  // but it does get there in a reasonable time, not a sluggish one
  let a = E.AIM_MIN, frames = 0;
  while (a < E.AIM_MAX - 1e-6 && frames < 600) { a = E.slewAim(a, E.AIM_MAX, 1 / 60); frames++; }
  assert.ok(frames / 60 < 0.75, `full sweep took ${(frames / 60).toFixed(2)}s`);
  assert.ok(span > 0);
});

test('traverse honours the arc clamp and small moves land exactly', () => {
  assert.equal(E.slewAim(E.AIM_MAX, 99, 1), E.AIM_MAX, 'cannot climb past the top of the arc');
  assert.equal(E.slewAim(E.AIM_MIN, -99, 1), E.AIM_MIN, 'nor below the bottom');
  const near = E.AIM_MIN + 0.01;
  assert.ok(Math.abs(E.slewAim(E.AIM_MIN, near, 1 / 60) - near) < 1e-9, 'short hops arrive');
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

/* ---------- ion cannon vs shielded, railgun vs hardened ---------- */

function hardenedChain() {
  const K = E.KIND.hardened;
  return { segs: [{ id: 1, kind: 'hardened', hp: K.hp, maxhp: K.hp, r: K.r, flash: 0, deflect: 0 }],
           s: 400, speed: 0, spacing: 30, recoil: 0, split: false };
}

test('the ion cannon bypasses a shielded segment\'s frontal deflection', () => {
  const seg = { kind: 'shielded' };
  const heading = { x: 1, y: 0 };   // segment moving right
  // a shot travelling left, straight into the leading face — deflects for
  // every other gun (see the existing "head-on shot is deflected" test),
  // but the collision loop special-cases 'ion' before ever calling this
  assert.equal(E.isDeflected(seg, heading, -520, 0), true,
    'isDeflected itself is unchanged — the bypass lives at the call site, not here');
});

test('hardened carries no resistance of its own — a plain tough kind', () => {
  assert.equal(E.KIND.hardened.ionResist, undefined);
  const heading = { x: 1, y: 0 };
  assert.equal(E.isDeflected({ kind: 'hardened' }, heading, -520, 0), false,
    'no shield flag, so it was never deflection-resistant either');
});

test('the railgun does bonus damage to a hardened segment', () => {
  const w = E.createWorld();
  const K = E.KIND.hardened;
  w.chains = [hardenedChain()];
  E.damageSeg(w, 0, 0, 3, { gun: 'rail' });
  assert.equal(w.chains[0].segs[0].hp, K.hp - 3 * K.railBonus);
});

test('other guns do plain damage to a hardened segment, no bonus and no penalty', () => {
  const w = E.createWorld();
  const K = E.KIND.hardened;
  w.chains = [hardenedChain()];
  E.damageSeg(w, 0, 0, 3, { gun: 'standard' });
  assert.equal(w.chains[0].segs[0].hp, K.hp - 3);
});

test('damage with no shot at all (a bomb) gets no railgun bonus', () => {
  const w = E.createWorld();
  const K = E.KIND.hardened;
  w.chains = [hardenedChain()];
  E.damageSeg(w, 0, 0, 3);
  assert.equal(w.chains[0].segs[0].hp, K.hp - 3);
});

test('the ion cannon unlocks through the same economy as the other gun types', () => {
  const w = E.createWorld();
  w.research.points = E.GUN_RP.ion;
  assert.equal(w.gunUnlocks.ion, false);
  assert.equal(E.researchGun(w, 'ion'), true);
  assert.equal(w.gunUnlocks.ion, true);
  assert.equal(w.scrap, 0);
});

test('hardened is introduced last, after every other kind', () => {
  assert.equal(E.KIND_UNLOCK.hardened, Math.max(...Object.values(E.KIND_UNLOCK)));
});

test('segment heading follows the path direction', () => {
  const ch = chain(4, 0, 300);
  const h = E.segHeading(path, pathLen, ch, 0);
  assert.ok(Math.abs(Math.hypot(h.x, h.y) - 1) < 1e-6, 'unit vector');
  assert.ok(Math.abs(h.x) > 0.9, 'first row runs horizontally');
});

test('a deflected shot survives and keeps the streak', () => {
  const w = E.createWorld();
  w.chains = [chain(14, 0, 700)];
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

test('an ion-cannon shot punches straight through a shielded plate\'s face', () => {
  const w = E.createWorld();
  w.chains = [chain(14, 0, 700)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'shielded');
  assert.ok(idx > 0, 'fixture has a shielded segment');

  const sp = E.segPos(path, pathLen, w.chains[0], idx);
  const h = E.segHeading(path, pathLen, w.chains[0], idx);
  const hpBefore = w.chains[0].segs[idx].hp;
  // same head-on shot the deflection test above uses, but fired by the ion cannon
  w.shots = [{ x: sp.x, y: sp.y, vx: -h.x * 520, vy: -h.y * 520, dmg: 1, pierce: 0, r: 3.2, gun: 'ion' }];
  E.stepShots(w, 1 / 60);

  assert.equal(w.chains[0].segs[idx].hp, hpBefore - 1, 'damage landed, angle notwithstanding');
  assert.equal(w.shots.length, 0, 'shot was consumed, not bounced');
});

/* ---------- regenerating segments ---------- */

test('a regenerator heals over time', () => {
  const w = E.createWorld();
  w.chains = [chain(20, 0, 700)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'regen');
  assert.ok(idx > 0, 'fixture has a regenerator');

  const seg = w.chains[0].segs[idx];
  seg.hp = 1;
  E.stepChains(w, 1.0);
  assert.ok(seg.hp > 1, `healed to ${seg.hp}`);
});

test('regeneration never exceeds the cap', () => {
  const w = E.createWorld();
  w.chains = [chain(20, 0, 700)];
  const seg = w.chains[0].segs.find(s => s.kind === 'regen');
  seg.hp = seg.maxhp - 0.1;
  E.stepChains(w, 10);
  assert.equal(seg.hp, seg.maxhp);
});

test('only regenerators heal', () => {
  const w = E.createWorld();
  w.chains = [chain(20, 0, 700)];
  const others = w.chains[0].segs.filter(s => s.kind !== 'regen');
  for (const s of others) s.hp = 1;
  E.stepChains(w, 2);
  for (const s of others) assert.equal(s.hp, 1, `${s.kind} must not heal`);
});

test('a destroyed regenerator does not come back', () => {
  const w = E.createWorld();
  w.chains = [chain(20, 0, 700)];
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
  w.chains = [chain(20, 40, 800)];
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
  w.chains = [chain(20, 40, 800)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'splitter');
  E.damageSeg(w, 0, idx, 99);
  assert.equal(w.chains[1].segs[0].kind, 'head', 'new head at the front of the tail');
  assert.equal(w.chains[1].segs[0].hp, E.KIND.head.hp, 'at full head health');
});

test('a split pays no recoil', () => {
  const w = E.createWorld();
  w.chains = [chain(20, 40, 800)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'splitter');
  E.damageSeg(w, 0, idx, 99);
  assert.equal(w.chains[0].recoil, 0, 'splitting buys no time — that is the trade');
});

test('a chain can only split once', () => {
  const w = E.createWorld();
  w.chains = [chain(26, 40, 900)];
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
    chain(20, 40, 800),
    chain(20, 40, 600),
    chain(20, 40, 400),
  ];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'splitter');
  E.damageSeg(w, 0, idx, 99);
  assert.equal(w.chains.length, E.MAX_CHAINS, 'at the cap, a splitter just dies');
});

test('a splitter too near an end falls back to recoil', () => {
  const w = E.createWorld();
  const ch = chain(10, 40, 500);
  // force a splitter one from the tail, where a split would leave a stub
  ch.segs[9] = { kind: 'splitter', hp: 1, maxhp: 4, r: 15, flash: 0, deflect: 0 };
  w.chains = [ch];

  E.damageSeg(w, 0, 9, 99);
  assert.equal(w.chains.length, 1, 'no split from a tail-end splitter');
});

test('both halves keep moving independently after a split', () => {
  const w = E.createWorld();
  w.chains = [chain(20, 40, 800)];
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
  w.chains = [chain(20, 40, 800)];
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
  w.chains = [chain(6, 40, 400), chain(6, 40, 200)];
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
  for (const b of E.BRANCHES) assert.equal(gun0(w).upgrades[b], 0);
});

test('buying spends scrap and raises the tier', () => {
  const w = E.createWorld();
  w.scrap = 1000;
  const cost = E.upgradeCost(gun0(w).upgrades, 'damage');
  assert.equal(E.buyUpgrade(w, 0, 'damage'), true);
  assert.equal(gun0(w).upgrades.damage, 1);
  assert.equal(w.scrap, 1000 - cost);
});

test('you cannot buy what you cannot afford', () => {
  const w = E.createWorld();
  w.scrap = 0;
  assert.equal(E.canAfford(w, 0, 'damage'), false);
  assert.equal(E.buyUpgrade(w, 0, 'damage'), false);
  assert.equal(gun0(w).upgrades.damage, 0);
});

test('a branch cannot be pushed past its last tier', () => {
  const w = openTree(E.createWorld());
  w.scrap = 1e6;
  for (let i = 0; i < E.MAX_TIER; i++) assert.equal(E.buyUpgrade(w, 0, 'cooling'), true);
  assert.equal(gun0(w).upgrades.cooling, E.MAX_TIER);
  assert.equal(E.upgradeCost(gun0(w).upgrades, 'cooling'), null, 'no cost once maxed');
  assert.equal(E.buyUpgrade(w, 0, 'cooling'), false);
  assert.equal(gun0(w).upgrades.cooling, E.MAX_TIER, 'tier unchanged');
});

/* ---------- research: the progression that outlives a run ---------- */

test('the last two tiers of a branch are locked until researched', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  for (let i = 0; i < E.FREE_TIER; i++) {
    assert.equal(E.buyUpgrade(w, 0, 'damage'), true, `tier ${i + 1} is free to all`);
  }
  assert.equal(gun0(w).upgrades.damage, E.FREE_TIER);
  assert.equal(E.buyUpgrade(w, 0, 'damage'), false, 'tier 4 needs research');
  assert.equal(E.canAfford(w, 0, 'damage'), false, 'and money is not the problem');
  assert.equal(E.upgradeCost(gun0(w).upgrades, 'damage', E.tierCap(w, 'damage')), null);

  w.research.points = E.DEPTH_RP[0];
  assert.equal(E.researchDepth(w, 'damage'), true);
  assert.equal(E.buyUpgrade(w, 0, 'damage'), true, 'and now it goes through');
  assert.equal(gun0(w).upgrades.damage, E.FREE_TIER + 1);
  assert.equal(E.buyUpgrade(w, 0, 'damage'), false, 'but only the one tier was opened');
});

test('research is bought per branch, not for the whole tree', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  w.research.points = 1e6;
  E.researchDepth(w, 'optics');
  assert.equal(E.tierCap(w, 'optics'), E.FREE_TIER + 1);
  assert.equal(E.tierCap(w, 'damage'), E.FREE_TIER, 'the others stay shallow');
});

test('depth research costs more the second time, and runs out', () => {
  const w = E.createWorld();
  w.research.points = 1e6;
  const first = E.depthCost(w, 'cooling');
  E.researchDepth(w, 'cooling');
  const second = E.depthCost(w, 'cooling');
  assert.ok(second > first, 'the fifth tier is dearer to open than the fourth');
  E.researchDepth(w, 'cooling');
  assert.equal(E.depthCost(w, 'cooling'), null, 'nothing left to open');
  assert.equal(E.researchDepth(w, 'cooling'), false);
  assert.equal(E.tierCap(w, 'cooling'), E.MAX_TIER);
});

test('research you cannot afford changes nothing', () => {
  const w = E.createWorld();
  w.research.points = E.DEPTH_RP[0] - 1;
  assert.equal(E.researchDepth(w, 'damage'), false);
  assert.equal(E.tierCap(w, 'damage'), E.FREE_TIER);
  assert.equal(w.research.points, E.DEPTH_RP[0] - 1, 'and cost nothing');
});

test('a run pays research for how far it got, once', () => {
  const w = E.createWorld();
  w.wave = 10;
  const owed = E.researchEarned(w);
  assert.ok(owed > 0);
  assert.equal(E.awardResearch(w), owed);
  assert.equal(w.research.points, owed);
  // a re-render of the game-over screen must not pay a second time
  assert.equal(E.awardResearch(w), 0);
  assert.equal(w.research.points, owed);
});

test('getting further is worth more research', () => {
  const at = (wave) => E.researchEarned({ wave });
  assert.equal(at(1), 0, 'dying on wave 1 teaches nothing');
  for (let wv = 2; wv <= 30; wv++) {
    assert.ok(at(wv) > at(wv - 1), `wave ${wv} should out-earn ${wv - 1}`);
  }
});

test('research survives a reset, and its guns come straight back', () => {
  const w = E.createWorld();
  w.research.points = 1e6;
  E.researchGun(w, 'mortar');
  E.researchDepth(w, 'optics');
  const points = w.research.points;

  w.wave = 12;
  E.resetRun(w);
  assert.equal(w.research.points, points, 'points carried over');
  assert.equal(w.research.guns.mortar, true);
  assert.equal(w.gunUnlocks.mortar, true, 'and the new run can fit it from wave 1');
  assert.equal(E.tierCap(w, 'optics'), E.FREE_TIER + 1, 'depth carried over too');
  assert.equal(w.researchPaid, false, 'and the new run can earn its own');
});

test('research is not run state, so a snapshot leaves it alone', () => {
  const w = E.createWorld();
  w.research.points = 1e6;
  E.researchGun(w, 'rail');
  const snap = JSON.parse(JSON.stringify(E.snapshot(w)));
  assert.equal(snap.research, undefined, 'not stored — the shell owns it');

  // and a run restored into a world with *different* research picks that up
  const fresh = E.createWorld();
  fresh.research.points = 1e6;
  E.researchGun(fresh, 'ion');
  assert.equal(E.hydrate(fresh, snap), true);
  assert.equal(fresh.gunUnlocks.ion, true, 'the research of the build resuming it applies');
  assert.equal(fresh.gunUnlocks.rail, false, 'not the research of the build that saved it');
});

test('a stored research object is clamped rather than trusted', () => {
  const junk = E.sanitizeResearch({
    points: -50,
    depth: { damage: 99, cooling: 'nonsense', optics: -3 },
    guns: { rail: 1, nonsense: true },
  });
  assert.equal(junk.points, 0, 'never negative');
  assert.equal(junk.depth.damage, E.MAX_TIER - E.FREE_TIER, 'clamped to what the shop can sell');
  assert.equal(junk.depth.cooling, 0);
  assert.equal(junk.depth.optics, 0);
  assert.equal(junk.guns.rail, true);
  assert.equal(junk.guns.nonsense, undefined, 'unknown types dropped');
  assert.equal(E.sanitizeResearch(null).points, 0, 'and nothing at all is fine');
});

/* ---------- gun marks ---------- */

test('a mark raises a gun type permanently, on every mount carrying it', () => {
  const w = E.createWorld();
  const before = E.gunStats(w, 'standard');
  assert.equal(before.dmg, E.GUN_TYPES.standard.dmg, 'unmarked is the table value');

  w.research.points = 1e6;
  assert.equal(E.researchMark(w, 'standard'), true);
  const after = E.gunStats(w, 'standard');
  assert.ok(after.dmg > before.dmg, 'hits harder');
  assert.ok(after.rate < before.rate, 'and reloads quicker — rate is a cooldown');
  assert.equal(E.gunStats(w, 'rail').dmg, E.GUN_TYPES.rail.dmg, 'other types untouched');
});

test('marks cap, and cost more each time', () => {
  const w = E.createWorld();
  w.research.points = 1e6;
  let last = 0;
  for (let i = 0; i < E.MAX_MARK; i++) {
    const cost = E.markCost(w, 'standard');
    assert.ok(cost > last, `mark ${i + 1} should cost more than the one before`);
    last = cost;
    assert.equal(E.researchMark(w, 'standard'), true);
  }
  assert.equal(E.markCost(w, 'standard'), null, 'nothing left to buy');
  assert.equal(E.researchMark(w, 'standard'), false);
});

test('a gun must be known before it can be marked', () => {
  const w = E.createWorld();
  w.research.points = 1e6;
  assert.equal(E.researchMark(w, 'rail'), false, 'not learned yet');
  assert.equal(w.research.marks.rail, 0);
  learn(w, 'rail');
  assert.equal(E.researchMark(w, 'rail'), true, 'and now it can be improved');
});

test('the starting cannon can be marked, unlike being learned', () => {
  // it is the gun every run begins with; being the one type that can never
  // improve would make it strictly a thing to replace
  const w = E.createWorld();
  w.research.points = 1e6;
  assert.equal(E.gunResearchCost(w, 'standard'), null, 'never learned');
  assert.equal(E.researchMark(w, 'standard'), true, 'but always improvable');
});

test('marks reach the shots a gun actually fires', () => {
  const plain = E.createWorld();
  E.fire(plain);
  const before = plain.shots[plain.shots.length - 1].dmg;

  const marked = E.createWorld();
  marked.research.points = 1e6;
  for (let i = 0; i < E.MAX_MARK; i++) E.researchMark(marked, 'standard');
  E.fire(marked);
  const after = marked.shots[marked.shots.length - 1].dmg;
  assert.ok(after > before, `a marked cannon should hit harder (${after} vs ${before})`);
});

test('marks survive a reset and are clamped on the way in', () => {
  const w = E.createWorld();
  w.research.points = 1e6;
  E.researchMark(w, 'standard');
  E.resetRun(w);
  assert.equal(w.research.marks.standard, 1, 'research is what carries between runs');

  const junk = E.sanitizeResearch({ marks: { standard: 99, rail: -4, nonsense: 3 } });
  assert.equal(junk.marks.standard, E.MAX_MARK, 'clamped to what the shop can sell');
  assert.equal(junk.marks.rail, 0);
  assert.equal(junk.marks.nonsense, undefined, 'unknown types dropped');
});

test('a world can be built with research already in hand', () => {
  const saved = E.newResearch();
  saved.points = 12;
  saved.guns.rail = true;
  const w = E.createWorld({ research: saved });
  assert.equal(w.research.points, 12);
  assert.equal(w.gunUnlocks.rail, true, 'a researched gun is fittable from the first wave');
});

/* ---------- the branch split ---------- */

test('every branch moves exactly one stat', () => {
  /* The point of splitting four branches into nine: a card's title is now its
     whole description. A branch that quietly moved a second stat would put the
     bundling straight back. */
  const w = E.createWorld();
  const base = E.stats(w, { upgrades: E.newUpgrades() });
  for (const b of E.BRANCHES) {
    const u = E.newUpgrades();
    u[b] = E.MAX_TIER;
    const after = E.stats(w, { upgrades: u });
    const moved = Object.keys(after).filter(k => after[k] !== base[k]);
    assert.ok(moved.length >= 1, `${b} moves nothing at all`);
    assert.ok(moved.includes(E.UPGRADES[b].stat),
      `${b} should move ${E.UPGRADES[b].stat}, moved ${moved}`);
    // munitions carries `bounces` alongside `pierce` on purpose: both are what
    // one round does after its first contact, and neither is worth its own card
    const extra = moved.filter(k => k !== E.UPGRADES[b].stat);
    assert.ok(extra.length === 0 || (b === 'munitions' && extra.join() === 'bounces'),
      `${b} also moved ${extra}`);
  }
});

test('splitting the tree redistributed its cost rather than inflating it', () => {
  /* The branches a given old branch became must sum to what it cost, or the
     split smuggles a difficulty change in under a UI change. Convergence is the
     one genuinely new line. */
  const sum = (b) => E.UPGRADES[b].costs.reduce((a, c) => a + c, 0);
  const near = (a, b, tol = 12) => Math.abs(a - b) <= tol;
  assert.ok(near(sum('damage') + sum('calibre'), 945), 'Barrel split');
  assert.ok(near(sum('cooling') + sum('breech') + sum('interlock'), 882), 'Chamber split');
  assert.ok(near(sum('velocity') + sum('optics'), 983), 'Optics split');
  assert.ok(near(sum('munitions'), 1063), 'Munitions kept');
  assert.ok(E.BRANCHES.length >= 8, 'and there really are more of them now');
});

test('every branch is buyable and reachable', () => {
  const w = E.createWorld();
  w.scrap = 1e9;
  w.research.points = 1e6;
  for (const b of E.BRANCHES) {
    while (E.researchDepth(w, b));
    for (let i = 0; i < E.MAX_TIER; i++) {
      assert.equal(E.buyUpgrade(w, 0, b), true, `${b} tier ${i + 1} should be buyable`);
    }
    assert.equal(E.upgradeCost(gun0(w).upgrades, b, E.tierCap(w, b)), null, `${b} maxes out`);
  }
});

/* ---------- convergence ---------- */

test('convergence moves the focal point toward the column', () => {
  const w = E.createWorld();
  w.scrap = 1e9; w.research.points = 1e6;
  w.wave = 3; E.spawnWave(w);
  w.chains[0].s = 900;                       // bring the column onto the board
  w.cannon.ang = -Math.PI / 2;               // straight up the middle

  const fixed = E.aimPointFor(w, gun0(w));
  const rFixed = Math.hypot(fixed.x - w.L.W / 2, fixed.y - w.cannon.y);
  assert.ok(Math.abs(rFixed - E.FOCUS_RANGE) < 1e-6, 'untouched, it sits at the fixed range');

  while (E.researchDepth(w, 'convergence'));
  for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(w, 0, 'convergence');
  const tracked = E.aimPointFor(w, gun0(w));
  const rTracked = Math.hypot(tracked.x - w.L.W / 2, tracked.y - w.cannon.y);
  assert.notEqual(rTracked, rFixed, 'bought, it tracks');
  assert.ok(rTracked >= E.MIN_FOCUS, 'but never pulls in past the floor');
});

test('the focal point never collapses onto the battery', () => {
  // at very short focal ranges the outer mounts angle almost sideways and their
  // rounds glance across the column instead of into it
  const w = E.createWorld();
  w.scrap = 1e9; w.research.points = 1e6;
  while (E.researchDepth(w, 'convergence'));
  while (E.buyMount(w));
  for (let m = 0; m < w.battery.guns.length; m++) {
    for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(w, m, 'convergence');
  }
  w.wave = 5; E.spawnWave(w);
  w.cannon.ang = -Math.PI / 2;
  // walk the column right up to the battery
  for (let s = 200; s < w.pathLen; s += 120) {
    w.chains[0].s = s;
    for (const g of w.battery.guns) {
      const p = E.aimPointFor(w, g);
      const r = Math.hypot(p.x - w.L.W / 2, p.y - w.cannon.y);
      assert.ok(r >= E.MIN_FOCUS - 1e-6, `focal range ${r} fell through the floor at s=${s}`);
    }
  }
});

test('with nothing on the aim line, convergence changes nothing', () => {
  const w = E.createWorld();
  w.scrap = 1e9; w.research.points = 1e6;
  while (E.researchDepth(w, 'convergence'));
  for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(w, 0, 'convergence');
  w.chains = [];
  const p = E.aimPointFor(w, gun0(w));
  const r = Math.hypot(p.x - w.L.W / 2, p.y - w.cannon.y);
  assert.ok(Math.abs(r - E.FOCUS_RANGE) < 1e-6, 'falls back to the fixed range');
});

test('unknown branches are rejected', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  assert.equal(E.buyUpgrade(w, 0, 'nonsense'), false);
  assert.equal(w.scrap, 1e6, 'no scrap taken');
});

test('stats resolve from the current tiers', () => {
  const w = E.createWorld();
  const base = E.stats(w, gun0(w));
  w.scrap = 1e6;
  E.buyUpgrade(w, 0, 'damage');
  const up = E.stats(w, gun0(w));
  assert.ok(up.dmg > base.dmg, 'barrel raises damage');
  assert.equal(up.shotSpeed, base.shotSpeed, 'other branches untouched');
});

test('each branch changes something the others do not', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  const base = E.stats(w, gun0(w));
  const touched = {};
  for (const b of E.BRANCHES) {
    const t = E.createWorld();
    t.scrap = 1e6;
    for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(t, 0, b);
    const s = E.stats(t, gun0(t));
    touched[b] = Object.keys(s).filter(k => s[k] !== base[k]);
    assert.ok(touched[b].length > 0, `${b} must change something`);
  }
  // no two branches should govern exactly the same stats
  const sigs = Object.values(touched).map(k => k.sort().join(','));
  assert.equal(new Set(sigs).size, sigs.length, 'branches overlap entirely');
});

test('the first shop visit is never empty-handed', () => {
  // wave 1 must fund at least one upgrade, or the shop feels pointless
  const ch = chain(E.waveCount(1), 100, 0);
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
    const ch = chain(E.waveCount(wv), 100, 0);
    income += ch.segs.reduce((a, s) => a + E.KIND[s.kind].scrap, 0);
  }
  const treeCost = E.fullTreeCost();
  const mountCost = E.MOUNT_COST.slice(1).reduce((a, b) => a + b, 0);
  // gun types are bought with research points now, not scrap — what a run's
  // scrap can be spent on is the tree, the mounts, and the refits
  const refitCost = E.GUN_KEYS.slice(1).reduce((a, k) => a + E.retrofitCost(E.createWorld(), 0, k) || 0, 0);
  const everything = treeCost + mountCost + refitCost;

  assert.ok(income < everything, `12 waves earns ${income}, everything costs ${everything}`);
  /* A third of the tree, not half: v30 split four branches into nine, and the
     nine include convergence, which is new spend rather than redistributed
     spend. The claim being made is "a good run makes real progress", and the
     fraction that means moved when the denominator grew. */
  assert.ok(income > treeCost * 0.33, `12 waves earns ${income} against a ${treeCost} tree`);
});

test('upgrades and overdrive multiply rather than replace', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(w, 0, 'damage');

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
  for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(cool, 0, 'cooling');

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
  const w = openTree(E.createWorld());
  w.scrap = 1e6;
  for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(w, 0, 'munitions');
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

test('velocity speeds shots up', () => {
  const w = E.createWorld();
  E.fire(w);
  const slow = w.shots[w.shots.length - 1];
  const v0 = Math.hypot(slow.vx, slow.vy);

  w.scrap = 1e6;
  for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(w, 0, 'velocity');
  gun0(w).cool = 0;
  E.fire(w);
  const fast = w.shots[w.shots.length - 1];
  assert.ok(Math.hypot(fast.vx, fast.vy) > v0);
});

/* ---------- the mortar actually lobs ---------- */

/** One stationary craft parked on the path, and a shot launched at it from
 *  `dist` pixels away. Positions come from the real path rather than a faked
 *  `_pos`, because `stepShots` clears that cache at the top of every frame. */
function shotAtCraft({ arc, dist }) {
  const w = E.createWorld();
  const s = w.pathLen * 0.5;
  const p = E.atS(w.path, w.pathLen, s);
  w.chains = [{
    segs: [{ id: E.nextSegId(), kind: 'std', hp: 99, maxhp: 99, r: 14, flash: 0, deflect: 0 }],
    s, speed: 0, spacing: E.SEGMENT_SPACING, recoil: 0, split: false,
  }];
  // fired from below-left along the path's own direction, at a set distance
  const spd = 600;
  w.shots = [{
    x: p.x, y: p.y + dist, vx: 0, vy: -spd,
    dmg: 5, pierce: 0, bounces: 9, r: 3, arc, travelled: 0,
    gun: arc ? 'mortar' : 'standard', col: '#fff',
  }];
  const hp = () => w.chains[0]?.segs[0]?.hp ?? 0;
  for (let i = 0; i < 200 && w.shots.length; i++) E.stepShots(w, 1 / 600);
  return { hit: hp() < 99, w };
}

/* The bug these pin: `arc: true` was set on every mortar shot and read by
   nothing at all, so the gun's whole selling point did not exist. */
test('a lobbed round passes over anything inside its arming distance', () => {
  const near = E.MORTAR_ARM * 0.5;
  assert.equal(shotAtCraft({ arc: true, dist: near }).hit, false,
    'the mortar round flew over it');
  assert.equal(shotAtCraft({ arc: false, dist: near }).hit, true,
    'and an ordinary round at the same range did not — so it is the lob, not the geometry');
});

test('a lobbed round comes down on anything past its arming distance', () => {
  const far = E.MORTAR_ARM * 2;
  assert.equal(shotAtCraft({ arc: true, dist: far }).hit, true,
    'it armed and struck the craft behind the front rank');
});

test('a mortar really does fire lobbed rounds', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  learn(w, 'mortar');
  E.setGunType(w, 0, 'mortar');
  E.fire(w);
  assert.ok(w.shots.length > 0, 'it fired');
  assert.equal(w.shots[0].arc, true);
  // and the standard cannon does not
  const w2 = E.createWorld();
  E.fire(w2);
  assert.equal(w2.shots[0].arc, false);
});

/* ---------- barrels fire parallel ---------- */

test('extra barrels fire parallel, not in a fan', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  E.buyBarrel(w, 0); E.buyBarrel(w, 0);
  assert.equal(w.battery.guns[0].barrels, 3);
  w.battery.ang = -Math.PI / 2 + 0.3;         // off-axis, so a fan would show
  E.fire(w);
  assert.equal(w.shots.length, 3, 'three barrels, three rounds');

  const heading = (s) => Math.atan2(s.vy, s.vx);
  const a0 = heading(w.shots[0]);
  for (const s of w.shots) {
    assert.ok(Math.abs(heading(s) - a0) < 1e-9, 'every round shares the heading');
  }
  // and they are genuinely displaced, not stacked on the same muzzle
  const xs = new Set(w.shots.map(s => s.x.toFixed(3)));
  assert.equal(xs.size, 3, 'three distinct muzzles');
});

test('flanking rounds are smaller and weaker than the main one', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  E.buyBarrel(w, 0); E.buyBarrel(w, 0);
  E.fire(w);
  const main = w.shots.find(s => !s.sub);
  const subs = w.shots.filter(s => s.sub);
  assert.equal(subs.length, 2);
  for (const s of subs) {
    assert.ok(s.dmg < main.dmg, 'weaker');
    assert.ok(s.r < main.r, 'smaller');
  }
});

test('the barrel count matches the offsets, so nobody fires a phantom round', () => {
  for (let n = 1; n <= E.MAX_BARRELS; n++) {
    assert.equal((E.BARREL_OFFSETS[n] || []).length, n - 1,
      `${n} barrels means ${n - 1} flanking ones`);
  }
});

/* ---------- retrofitting ---------- */

test('changing a mount to another type costs scrap; building one does not', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  learn(w, 'rail');
  const before = w.scrap;
  const cost = E.retrofitCost(w, 0, 'rail');
  assert.ok(cost > 0, 'a retrofit has a price');
  assert.equal(E.setGunType(w, 0, 'rail'), true);
  assert.equal(w.scrap, before - cost);
  assert.equal(gun0(w).type, 'rail');

  // setting it to what it already is costs nothing and does nothing
  const after = w.scrap;
  assert.equal(E.retrofitCost(w, 0, 'rail'), null);
  E.setGunType(w, 0, 'rail');
  assert.equal(w.scrap, after);

  // a mount bought fresh is standard, and was not billed a retrofit for it
  const s0 = w.scrap;
  E.buyMount(w);
  assert.equal(w.battery.guns[1].type, 'standard');
  assert.equal(w.scrap, s0 - E.MOUNT_COST[1], 'only the mount was charged');
});

test('an unresearched type cannot be fitted at any price', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  assert.equal(E.retrofitCost(w, 0, 'ion'), null);
  assert.equal(E.setGunType(w, 0, 'ion'), false);
  assert.equal(gun0(w).type, 'standard');
});

test('a retrofit you cannot afford leaves the mount alone', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  learn(w, 'mortar');
  w.scrap = 1;
  assert.equal(E.setGunType(w, 0, 'mortar'), false);
  assert.equal(gun0(w).type, 'standard');
  assert.equal(w.scrap, 1, 'and did not take the money');
});

/* ---------- a breach sends you to the shop ---------- */

test('losing a life opens the shop instead of restarting the wave', () => {
  const w = E.createWorld();
  w.wave = 5;
  E.spawnWave(w);
  w.running = true;
  const lives = w.lives;
  E.breach(w);
  assert.equal(w.lives, lives - 1);
  assert.equal(w.shopOpen, true, 'the shop opened');
  assert.equal(w.running, false, 'and the board is on hold');
});

test('leaving the shop after a breach retries the same wave, not the next', () => {
  const w = E.createWorld();
  w.wave = 5;
  E.spawnWave(w);
  w.running = true;
  E.breach(w);
  E.nextWave(w);
  assert.equal(w.wave, 5, 'still wave 5 — this was a retry');
  assert.equal(w.running, true);
  assert.equal(w.retry, false, 'and the flag was consumed');

  // whereas clearing a wave normally does advance
  w.chains = [];
  E.step(w, 0.01);
  E.step(w, 2);
  assert.equal(w.shopOpen, true, 'a clear opens the shop too');
  E.nextWave(w);
  assert.equal(w.wave, 6, 'and that one moves on');
});

test('the last life ends the run rather than opening the shop', () => {
  const w = E.createWorld();
  w.lives = 1;
  E.spawnWave(w);
  E.breach(w);
  assert.equal(w.over, true);
  assert.equal(w.shopOpen, false, 'no shopping after the battery is gone');
});

/* ---------- upgrades are per emplacement ---------- */

test('buying on one mount leaves the others untouched', () => {
  const w = openTree(E.createWorld());
  w.scrap = 1e6;
  E.buyMount(w); E.buyMount(w);
  assert.equal(w.battery.guns.length, 3);

  for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(w, 1, 'damage');
  assert.equal(w.battery.guns[1].upgrades.damage, E.MAX_TIER);
  assert.equal(w.battery.guns[0].upgrades.damage, 0, 'mount 0 untouched');
  assert.equal(w.battery.guns[2].upgrades.damage, 0, 'mount 2 untouched');

  // and it shows up in the numbers, not just the counter
  assert.ok(E.stats(w, w.battery.guns[1]).dmg > E.stats(w, w.battery.guns[0]).dmg);
});

test('a new mount arrives bare, however deep the others are', () => {
  // this is the balance: a fifth gun competes with deepening the four you have
  const w = E.createWorld();
  w.scrap = 1e6;
  for (const b of E.BRANCHES) while (E.buyUpgrade(w, 0, b));
  E.buyMount(w);
  const fresh = w.battery.guns[1];
  for (const b of E.BRANCHES) assert.equal(fresh.upgrades[b], 0, `${b} starts at zero`);
});

test('buying against a mount that does not exist changes nothing', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  const before = w.scrap;
  assert.equal(E.buyUpgrade(w, 4, 'damage'), false);
  assert.equal(E.canAfford(w, 4, 'damage'), false);
  assert.equal(w.scrap, before, 'and it did not take the money');
});

test('each gun cools at its own Chamber tier', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  E.buyMount(w);
  for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(w, 0, 'cooling');
  const [hot, cold] = w.battery.guns;
  hot.heat = 1; cold.heat = 1;
  E.stepCannon(w, 0.5, false);
  assert.ok(hot.heat < cold.heat, 'the upgraded mount shed more heat');
});

test('a maxed battery costs five trees plus the mounts', () => {
  // the sanity check that a run cannot buy everything: it is five times what
  // it used to be, which is the whole reason the prices were left alone
  assert.equal(E.fullBatteryCost(),
    E.fullTreeCost() * E.MAX_MOUNTS + E.MOUNT_COST.reduce((a, c) => a + c, 0));
  assert.ok(E.fullBatteryCost() > E.fullTreeCost() * 4, 'a wide battery is a real commitment');
});

test('resetting a run wipes the tree', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  E.buyUpgrade(w, 0, 'damage');
  E.buyUpgrade(w, 0, 'optics');
  E.resetRun(w);
  for (const b of E.BRANCHES) assert.equal(gun0(w).upgrades[b], 0, `${b} reset`);
  assert.equal(w.scrap, 0);
});

test('a bigger battery measurably improves survival', () => {
  // with longer, tankier snakes, raw firepower is the survival lever — and
  // the clearest source of it is more guns
  const aim = (w) => {
    let best = null, bd = Infinity;
    for (const ch of w.chains) {
      for (let i = 0; i < ch.segs.length; i++) {
        // skip the head while any body remains: it takes a fraction of normal
        // damage until the chain behind it is gone, so aiming there is wasted
        if (i === 0 && ch.segs.length > 1) continue;
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

test('a carrier that drops something drops exactly one valid pickup', () => {
  const w = E.createWorld({ drops: true });
  // most carriers come up empty since v29, so seed forward to one that doesn't
  let dropped = 0;
  for (let n = 0; n < 60 && dropped === 0; n++) {
    w.chains = [chain(16, 0, 700)];
    w.pickups = [];
    const idx = w.chains[0].segs.findIndex(s => s.kind === 'carrier');
    assert.ok(idx > 0, 'fixture has a carrier');
    E.damageSeg(w, 0, idx, 99);
    dropped = w.pickups.length;
    assert.ok(dropped <= 1, 'never more than one from a carrier');
  }
  assert.equal(dropped, 1, 'a carrier does drop, given enough of them');
  assert.ok(E.POWERUPS[w.pickups[0].kind], 'dropped a valid kind');
});

test('most carriers come up empty, so a power-up is an event', () => {
  /* Reported as drops being far too frequent: one segment in six is a carrier
     and every one of them yielded, so a wave-10 column of 54 rained about nine
     power-ups and an effect was almost always running. */
  const w = E.createWorld({ drops: true });
  let hits = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) if (E.rollDrop(w)) hits++;
  const rate = hits / N;
  assert.ok(Math.abs(rate - E.DROP_CHANCE) < 0.05,
    `expected about ${E.DROP_CHANCE}, got ${rate.toFixed(3)}`);
  assert.ok(rate < 0.5, 'and well under the every-carrier rate it replaced');
});

test('a seeded run still drops identically', () => {
  const a = E.createWorld({ drops: true });
  const b = E.createWorld({ drops: true });
  const seq = (w) => Array.from({ length: 40 }, () => E.rollDrop(w));
  assert.deepEqual(seq(a), seq(b), 'same seed, same drops — including the misses');
});

test('with drops off — the default — a carrier drops nothing', () => {
  const w = E.createWorld();
  assert.equal(w.drops, false, 'off unless asked for');
  w.chains = [chain(16, 0, 700)];
  const idx = w.chains[0].segs.findIndex(s => s.kind === 'carrier');
  E.damageSeg(w, 0, idx, 99);
  assert.equal(w.pickups.length, 0, 'the carrier still dies, it just drops nothing');
});

test('non-carriers drop nothing', () => {
  const w = E.createWorld();
  w.chains = [chain(16, 0, 700)];
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
  E.applyPowerup(w, 'spread', 0);
  E.fire(w);
  assert.equal(w.shots.length, 3, 'centre plus two flankers');  // one gun, fan of 3
  const angles = w.shots.map(s => Math.atan2(s.vy, s.vx));
  assert.equal(new Set(angles.map(a => a.toFixed(3))).size, 3, 'all at different angles');
});

test('spread belongs to the gun that shot it, not the battery', () => {
  /* Five mounts all fanning off one pickup turned a single catch into a wall of
     rounds and made aiming irrelevant for nine seconds. A fan is a property of
     a gun. */
  const w = E.createWorld();
  w.scrap = 1e6;
  E.buyMount(w); E.buyMount(w);
  assert.equal(w.battery.guns.length, 3);

  E.applyPowerup(w, 'spread', 1);
  assert.equal(E.gunHasEffect(w.battery.guns[1], 'spread'), true, 'mount 2 has it');
  assert.equal(E.gunHasEffect(w.battery.guns[0], 'spread'), false, 'mount 1 does not');
  assert.equal(E.hasEffect(w, 'spread'), false, 'and it is not a battery-wide effect');

  for (const g of w.battery.guns) g.cool = 0;
  E.fire(w);
  // 1 + 3 + 1: only the middle mount fans
  assert.equal(w.shots.length, 5, `expected one fanning mount, got ${w.shots.length} rounds`);
});

test('a round that claims a pickup hands it to the mount that fired it', () => {
  const w = E.createWorld({ drops: true });
  w.scrap = 1e6;
  E.buyMount(w); E.buyMount(w);
  // a pickup parked exactly where mount 3's round will be
  const gun = w.battery.guns[2];
  w.shots = [{ x: gun.x, y: 300, vx: 0, vy: -400, dmg: 1, pierce: 0, r: 4,
               bounces: 2, bounced: 0, mount: 2, travelled: 0 }];
  E.spawnPickup(w, gun.x, 300, 'spread');
  E.stepShots(w, 1 / 60);
  assert.equal(E.gunHasEffect(w.battery.guns[2], 'spread'), true, 'the firing mount got it');
  assert.equal(E.gunHasEffect(w.battery.guns[0], 'spread'), false);
});

test('a pickup caught rather than shot still lands on one mount', () => {
  /* The catch band sits at the battery centre, not on each mount, so a caught
     pickup has no gun that "earned" it. It goes to the mount nearest where it
     landed — which for a centre catch is the centre gun. The point being
     asserted is that it is still *one* mount and not the whole battery. */
  const w = E.createWorld({ drops: true });
  w.scrap = 1e6;
  E.buyMount(w); E.buyMount(w);
  E.spawnPickup(w, w.cannon.x, w.cannon.y - 10, 'spread');
  E.stepPickups(w, 1 / 60);
  assert.equal(w.pickups.length, 0, 'it was caught');

  const fanning = w.battery.guns.filter(g => E.gunHasEffect(g, 'spread'));
  assert.equal(fanning.length, 1, 'exactly one mount got it');
  assert.equal(fanning[0], w.battery.guns[0], 'the one under the catch band');
  assert.equal(E.hasEffect(w, 'spread'), false, 'never battery-wide');
});

test('a mount\'s spread times out on its own', () => {
  const w = E.createWorld();
  E.applyPowerup(w, 'spread', 0);
  const gun = w.battery.guns[0];
  assert.equal(E.gunHasEffect(gun, 'spread'), true);
  E.stepPickups(w, E.POWERUPS.spread.dur + 0.1);
  assert.equal(E.gunHasEffect(gun, 'spread'), false, 'and is cleaned up, not left at zero');
  assert.equal(gun.effects.spread, undefined);
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
  w.chains = [chain(8, 100, 400)];
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
  w.chains = [chain(20, 100, 700)];
  const seg = w.chains[0].segs.find(s => s.kind === 'regen');
  seg.hp = 1;
  E.applyPowerup(w, 'freeze');
  E.stepChains(w, 1);
  assert.ok(seg.hp > 1);
});

test('a bomb damages segments near where it was caught', () => {
  const w = E.createWorld();
  w.chains = [chain(10, 0, 500)];
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
  w.chains = [chain(10, 0, 500)];
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
  w.chains = [chain(8, 0, 400)];
  E.damageSeg(w, 0, 1, 99);
  assert.ok(w.hitStop > 0, 'brief freeze on impact');
  assert.ok(w.shake > 0, 'screen shake on impact');
});

test('tougher targets stop the world for longer', () => {
  const soft = E.createWorld();
  soft.chains = [chain(16, 0, 700)];
  const softIdx = soft.chains[0].segs.findIndex(s => s.kind === 'std');
  E.damageSeg(soft, 0, softIdx, 99);

  const hard = E.createWorld();
  hard.chains = [chain(16, 0, 700)];
  const hardIdx = hard.chains[0].segs.findIndex(s => s.kind === 'armored');
  E.damageSeg(hard, 0, hardIdx, 99);

  assert.ok(hard.hitStop > soft.hitStop, 'armored kills hit harder');
});

test('hit-stop pauses the simulation but always resolves', () => {
  const w = E.createWorld();
  w.chains = [chain(8, 100, 400)];
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
  kill.chains = [chain(8, 0, 400)];
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
        // skip the head while any body remains: it takes a fraction of normal
        // damage until the chain behind it is gone, so aiming there is wasted
        if (i === 0 && ch.segs.length > 1) continue;
        const p = E.segPos(w.path, w.pathLen, ch, i);
        if (p.off) continue;
        const d = Math.hypot(p.x - w.cannon.x, p.y - w.cannon.y);
        if (d < bd) { bd = d; best = p; }
      }
    }
    if (best) w.cannon.ang = E.clampAim(Math.atan2(best.y - w.cannon.y, best.x - w.cannon.x));
  };

  const w = E.createWorld({ drops: true });   // the point of this test is drops
  w.wave = ALL_KINDS;
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
        // skip the head while any body remains: it takes a fraction of normal
        // damage until the chain behind it is gone, so aiming there is wasted
        if (i === 0 && ch.segs.length > 1) continue;
        const p = E.segPos(w.path, w.pathLen, ch, i);
        if (p.off) continue;
        const d = Math.hypot(p.x - w.cannon.x, p.y - w.cannon.y);
        if (d < bd) { bd = d; best = p; }
      }
    }
    if (best) w.cannon.ang = E.clampAim(Math.atan2(best.y - w.cannon.y, best.x - w.cannon.x));
  };

  const w = E.createWorld();
  w.wave = ALL_KINDS;
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

/* ---------- multi-barrel upgrade ---------- */

test('a new mount starts with one barrel', () => {
  const w = E.createWorld();
  assert.equal(w.battery.guns[0].barrels, 1);
  w.scrap = 1e6;
  E.buyBarrel(w, 0); E.buyBarrel(w, 0);
  E.buyMount(w);
  assert.equal(w.battery.guns[1].barrels, 1, 'a new mount arrives bare, barrels included');
});

test('barrels cost escalating scrap and cap at three, per mount', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  const c1 = E.barrelCost(w, 0);
  assert.equal(E.buyBarrel(w, 0), true);
  assert.equal(w.battery.guns[0].barrels, 2);
  const c2 = E.barrelCost(w, 0);
  assert.ok(c2 > c1, 'the third barrel costs more than the second');
  assert.equal(E.buyBarrel(w, 0), true);
  assert.equal(w.battery.guns[0].barrels, E.MAX_BARRELS);
  assert.equal(E.barrelCost(w, 0), null, 'no cost once maxed');
  assert.equal(E.buyBarrel(w, 0), false, 'cannot buy past the cap');
});

test('barrels are bought per emplacement, not for the battery', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  E.buyMount(w);
  assert.equal(w.battery.guns.length, 2);
  E.buyBarrel(w, 0); E.buyBarrel(w, 0);
  assert.equal(w.battery.guns[0].barrels, 3, 'mount 1 is kitted out');
  assert.equal(w.battery.guns[1].barrels, 1, 'mount 2 paid for none of it');

  // and each fires its own number of rounds
  w.battery.guns[0].cool = 0; w.battery.guns[1].cool = 0;
  E.fire(w);
  assert.equal(w.shots.length, 4, 'three from the first mount, one from the second');
});

test('a barrel on a mount that does not exist is refused', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  assert.equal(E.buyBarrel(w, 3), false);
  assert.equal(E.barrelCost(w, 3), null);
  assert.equal(w.scrap, 1e6, 'and it cost nothing');
});

test('a barrel you cannot afford is refused', () => {
  const w = E.createWorld();
  w.scrap = 0;
  assert.equal(E.buyBarrel(w, 0), false);
  assert.equal(w.battery.guns[0].barrels, 1);
});

test('more barrels means more shots per volley, from the same gun', () => {
  const w = E.createWorld();
  w.battery.guns[0].barrels = 3;
  E.fire(w);
  assert.equal(w.shots.length, 3, 'one gun, three barrels, three shots');
});

test('resetRun puts barrels back to one', () => {
  const w = E.createWorld();
  w.battery.guns[0].barrels = 3;
  E.resetRun(w);
  assert.equal(w.battery.guns[0].barrels, 1);
});

test('a snapshot round-trips each mount\'s barrel count', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  E.buyMount(w);
  w.battery.guns[0].barrels = 3;
  w.battery.guns[1].barrels = 2;
  const snap = JSON.parse(JSON.stringify(E.snapshot(w)));
  const fresh = E.createWorld();
  assert.equal(E.hydrate(fresh, snap), true);
  assert.equal(fresh.battery.guns[0].barrels, 3);
  assert.equal(fresh.battery.guns[1].barrels, 2);
});

test('a pre-v28 save resumes with its barrels on every mount', () => {
  /* Barrels were battery-wide until v28, stored as one top-level count. The
     fair reading of an old save is that every mount had it — which is what the
     old build actually did — so dropping it would silently delete the most
     expensive thing the player had bought. */
  const w = E.createWorld();
  w.scrap = 1e6;
  E.buyMount(w);
  const snap = JSON.parse(JSON.stringify(E.snapshot(w)));
  snap.barrels = 3;                                   // the old shape
  for (const g of snap.battery.guns) delete g.barrels;
  const fresh = E.createWorld();
  assert.equal(E.hydrate(fresh, snap), true);
  for (const g of fresh.battery.guns) assert.equal(g.barrels, 3);
});

test('a shot keeps the colour it was fired at, even if the streak changes after', () => {
  const w = E.createWorld();
  w.cannon.od = 0;
  E.fire(w);
  const firedCool = w.shots[0].col;
  assert.equal(firedCool, E.OD_TIERS[0].col);

  // streak climbs after the shot is already in flight
  w.cannon.od = E.OD_TIERS.length - 1;
  assert.equal(w.shots[0].col, firedCool, 'baked in at fire time, not read live off the battery');
});

test('gun types are learned once, with research points, and only when affordable', () => {
  const w = E.createWorld();
  assert.equal(w.gunUnlocks.rail, false);
  w.scrap = 1e6;
  assert.equal(E.researchGun(w, 'rail'), false, 'scrap does not buy research');

  w.research.points = E.GUN_RP.rail;
  assert.equal(E.researchGun(w, 'rail'), true);
  assert.equal(w.gunUnlocks.rail, true, 'and this run can fit it now');
  assert.equal(w.research.points, 0, 'points spent');
  assert.equal(w.scrap, 1e6, 'and no scrap was touched');
  assert.equal(E.researchGun(w, 'rail'), false, 'cannot learn it twice');
  assert.equal(E.gunResearchCost(w, 'rail'), null, 'and it has no price any more');
});

test('standard is never something to research', () => {
  const w = E.createWorld();
  w.research.points = 1e6;
  assert.equal(E.researchGun(w, 'standard'), false);
  assert.equal(E.gunResearchCost(w, 'standard'), null);
  assert.ok(E.gunAvailable(w, 'standard'), 'it is always available');
});

test('a gun type can only be assigned once researched', () => {
  const w = E.createWorld();
  assert.equal(E.setGunType(w, 0, 'rail'), false, 'unresearched type refused');
  w.scrap = 1e6;
  learn(w, 'rail');
  assert.equal(E.setGunType(w, 0, 'rail'), true);
  assert.equal(w.battery.guns[0].type, 'rail');
});

test('gun types change shot character', () => {
  const w = E.createWorld();
  w.scrap = 1e6;
  learn(w, 'rail');
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
  w.chains = [chain(10, 0, 500)];
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
  w.chains = [chain(10, 0, 500)];
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
  learn(w, 'rail');
  E.setGunType(w, 0, 'rail');
  E.resetRun(w);
  assert.equal(w.battery.guns.length, 1);
  assert.equal(w.battery.guns[0].type, 'standard');
  // the *fitting* is gone, but the research that made it fittable is not —
  // that is the whole point of research being permanent
  assert.equal(w.gunUnlocks.rail, true, 'a learned gun stays learned');
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

test('a volley calls fx.shot exactly once, with the number of barrels', () => {
  let calls = 0, lastCount = 0;
  const w = E.createWorld({ fx: { burst() {}, push() {}, shot(n) { calls++; lastCount = n; } } });
  E.fire(w);
  assert.equal(calls, 1, 'one hook per volley');
  assert.equal(lastCount, 1, 'reports how many guns fired');
  // a blocked volley (still cooling) must not sound
  E.fire(w);
  assert.equal(calls, 1, 'no hook when nothing fires');
});

test('fire tolerates an fx object without a shot hook', () => {
  // every fx call is optional; older shells and tests pass burst/push only
  const w = E.createWorld({ fx: { burst() {}, push() {} } });
  assert.doesNotThrow(() => E.fire(w));
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
  w.chains = [chain(8, 0, 500)];
  const target = E.segPos(path, pathLen, w.chains[0], 3);
  w.shots = [{ x: target.x, y: target.y, vx: 0, vy: 0, dmg: 1, pierce: 0, r: 3.2 }];

  E.stepShots(w, 1 / 60);
  assert.equal(w.shots.length, 0, 'shot consumed');
  assert.equal(w.cannon.streak, 1, 'hit registered');
});

test('a piercing shot survives its first hit', () => {
  const w = E.createWorld();
  w.chains = [chain(8, 0, 500)];
  const target = E.segPos(path, pathLen, w.chains[0], 3);
  w.shots = [{ x: target.x, y: target.y, vx: 0, vy: 0, dmg: 1, pierce: 1, r: 3.2 }];

  E.stepShots(w, 1 / 60);
  assert.equal(w.shots.length, 1, 'shot lives on');
  assert.equal(w.shots[0].pierce, 0, 'pierce spent');
});

/* ---------- breach and lives ---------- */

test('no breach while the chain is still up the path', () => {
  const w = E.createWorld();
  w.chains = [chain(8, 40, 300)];
  assert.equal(E.checkBreach(w), false);
});

test('breach fires when a segment crosses the floor line', () => {
  const w = E.createWorld();
  w.chains = [chain(8, 40, pathLen - 5)];
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
  w.wave = ALL_KINDS;      // late enough that splitters exist at all
  /* Equipped, not bare. Splitters sit mid-chain behind a lot of hp, and by
     the wave they unlock a real player has spent a run's worth of scrap —
     a stock single cannon sweeping blindly cannot chew deep enough to reach
     one, so testing with one measured the bot, not the mechanic. */
  w.scrap = 1e6;
  for (const b of E.BRANCHES) for (let i = 0; i < E.MAX_TIER; i++) E.buyUpgrade(w, 0, b);
  while (E.buyMount(w)) { /* fill every mount */ }
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
  w.chains = [chain(6, 40, 400), chain(6, 40, 200)];
  E.step(w, 1 / 60);
  assert.equal(w.chains.length, 2, 'both chains simulate independently');
});
