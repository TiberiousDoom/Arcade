import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.js';

const L = E.LAYOUT;

/** A live world with nothing queued, for tests that stage their own warheads. */
function quiet(opts = {}) {
  const w = E.createWorld(opts);
  w.running = true;
  w.toSpawn = 0;
  return w;
}

/** A warhead falling straight down onto city `i`, starting at height y. */
function warheadOver(w, i, y = 200) {
  const c = w.cities[i];
  return {
    x0: c.x, y0: y, x: c.x, y, tx: c.x, ty: L.GROUND_Y, len: L.GROUND_Y - y, d: 0,
    speed: 100, target: { kind: 'city', i }, splitAt: null,
  };
}

const run = (w, secs, dt = 1 / 60) => { for (let t = 0; t < secs; t += dt) E.step(w, dt); };

/* ---------- board and setup ---------- */

test('the board is portrait, with the ground near the bottom', () => {
  assert.ok(L.H > L.W);
  assert.ok(L.GROUND_Y < L.H && L.GROUND_Y > L.H * 0.8);
  assert.ok(L.FIRE_FLOOR < L.GROUND_Y, 'nothing is aimed into the ground');
});

test('a new world has six cities, three full batteries and wave 1 queued', () => {
  const w = E.createWorld();
  assert.equal(w.cities.length, 6);
  assert.ok(w.cities.every(c => c.alive));
  assert.equal(w.bases.length, 3);
  assert.equal(E.ammoLeft(w), 3 * E.BASE_AMMO);
  assert.equal(w.toSpawn, E.waveCount(1));
  assert.equal(w.running, false, 'nothing moves until the shell starts it');
});

test('cities sit between the batteries, never on them', () => {
  const w = E.createWorld();
  for (const c of w.cities) for (const b of w.bases) assert.ok(Math.abs(c.x - b.x) > 20);
});

/* ---------- determinism ---------- */

test('the same seed releases the same warheads', () => {
  const a = E.createWorld({ seed: 7 }), b = E.createWorld({ seed: 7 });
  a.running = b.running = true;
  run(a, 12); run(b, 12);
  assert.deepEqual(a.warheads.map(h => [h.x0, h.tx]), b.warheads.map(h => [h.x0, h.tx]));
  assert.ok(a.warheads.length > 1, 'and some were released');
});

test('a different seed releases different ones', () => {
  const a = E.createWorld({ seed: 7 }), b = E.createWorld({ seed: 8 });
  a.running = b.running = true;
  run(a, 12); run(b, 12);
  assert.notDeepEqual(a.warheads.map(h => h.x0), b.warheads.map(h => h.x0));
});

/* ---------- firing ---------- */

test('a tap fires from the nearest battery and spends one interceptor', () => {
  const w = quiet();
  assert.equal(E.fire(w, 40, 400), true);
  assert.equal(w.bases[0].ammo, E.BASE_AMMO - 1, 'the left battery answered a tap on the left');
  assert.equal(w.interceptors.length, 1);
  E.fire(w, L.W / 2, 400);
  assert.equal(w.bases[1].ammo, E.BASE_AMMO - 1, 'and the centre one a tap in the middle');
});

test('an empty battery hands the shot to the next nearest', () => {
  const w = quiet();
  w.bases[0].ammo = 0;
  assert.equal(E.fire(w, 20, 300), true);
  assert.equal(w.bases[1].ammo, E.BASE_AMMO - 1);
});

test('with every battery spent, a tap fires nothing', () => {
  const seen = [];
  const w = quiet({ fx: { empty: () => seen.push('empty') } });
  for (const b of w.bases) b.ammo = 0;
  assert.equal(E.fire(w, 300, 300), false);
  assert.equal(w.interceptors.length, 0);
  assert.deepEqual(seen, ['empty'], 'and says so');
});

test('nothing is fired into the ground, off the board, or while not running', () => {
  const w = quiet();
  assert.equal(E.fire(w, 300, L.FIRE_FLOOR + 1), false);
  assert.equal(E.fire(w, -5, 300), false);
  assert.equal(E.fire(w, 300, -5), false);
  w.running = false;
  assert.equal(E.fire(w, 300, 300), false);
  assert.equal(E.ammoLeft(w), 3 * E.BASE_AMMO, 'and nothing was spent');
});

test('an interceptor reaches its point and bursts there', () => {
  const w = quiet();
  w.warheads.push(warheadOver(w, 0, 50));      // keep the wave open
  E.fire(w, 300, 400);
  const dur = w.interceptors[0].dur;
  run(w, dur + 0.05);
  assert.equal(w.interceptors.length, 0);
  assert.equal(w.blasts.length, 1);
  assert.equal(w.blasts[0].x, 300); assert.equal(w.blasts[0].y, 400);
});

test('a burst grows, holds and fades away', () => {
  assert.equal(E.blastRadius(0), 0);
  assert.equal(E.blastRadius(E.BLAST_GROW), E.BLAST_R);
  assert.equal(E.blastRadius(E.BLAST_GROW + E.BLAST_HOLD / 2), E.BLAST_R);
  assert.ok(E.blastRadius(E.BLAST_LIFE - 0.05) < E.BLAST_R * 0.2);
  assert.equal(E.blastRadius(E.BLAST_LIFE), 0);
});

/* ---------- warheads ---------- */

test('a warhead inside a burst is destroyed and scores', () => {
  const kills = [];
  const w = quiet({ fx: { kill: (x, y) => kills.push([x, y]) } });
  const h = warheadOver(w, 2, 400);
  w.warheads.push(h);
  w.blasts.push({ x: h.x, y: h.y + 5, t: E.BLAST_GROW });
  E.step(w, 1 / 60);
  assert.equal(w.warheads.length, 0);
  assert.equal(w.score, E.WARHEAD_SCORE * E.scoreMult(1));
  assert.equal(kills.length, 1);
});

test('a warhead outside every burst keeps falling', () => {
  const w = quiet();
  w.warheads.push(warheadOver(w, 2, 400));
  w.blasts.push({ x: 50, y: 100, t: E.BLAST_GROW });
  E.step(w, 1 / 60);
  assert.equal(w.warheads.length, 1);
  assert.ok(w.warheads[0].y > 400);
});

test('a warhead that reaches its city destroys it', () => {
  const lost = [];
  const w = quiet({ fx: { cityLost: (x) => lost.push(x) } });
  w.warheads.push(warheadOver(w, 3, L.GROUND_Y - 20));
  w.warheads.push(warheadOver(w, 0, 10));      // keep the wave open
  run(w, 0.5);
  assert.equal(w.cities[3].alive, false);
  assert.equal(lost.length, 1);
  assert.equal(E.citiesLeft(w), 5);
});

test('a warhead that reaches a battery takes its ammunition with it', () => {
  const w = quiet();
  const b = w.bases[1];
  w.warheads.push({ x0: b.x, y0: L.GROUND_Y - 10, x: b.x, y: L.GROUND_Y - 10, tx: b.x, ty: L.GROUND_Y,
    len: 10, d: 0, speed: 100, target: { kind: 'base', i: 1 }, splitAt: null });
  w.warheads.push(warheadOver(w, 0, 10));
  run(w, 0.3);
  assert.equal(b.alive, false);
  assert.equal(b.ammo, 0);
  assert.equal(E.fire(w, L.W / 2, 300), true, 'a tap above it falls to a neighbour');
  assert.notEqual(w.interceptors[0].base, 1);
});

test('warheads fall faster each wave, up to a cap', () => {
  assert.ok(E.warheadSpeed(5) > E.warheadSpeed(1));
  assert.equal(E.warheadSpeed(200), E.warheadSpeed(400), 'capped');
  // the opening crossing is slow enough to learn on
  assert.ok(L.GROUND_Y / E.warheadSpeed(1) > 12, 'wave 1 takes a while to land');
});

test('waves grow, up to a cap', () => {
  assert.ok(E.waveCount(5) > E.waveCount(1));
  assert.equal(E.waveCount(100), E.waveCount(200));
});

test('a wave never sends more warheads than three batteries can answer at the start', () => {
  // splits add more later, which is the point of them; the opening count is fair
  assert.ok(E.waveCount(1) <= 3 * E.BASE_AMMO);
});

/* ---------- splitting ---------- */

test('nothing splits before the splitting wave', () => {
  for (let wv = 1; wv < E.SPLIT_WAVE; wv++) assert.equal(E.splitChance(wv), 0);
  assert.ok(E.splitChance(E.SPLIT_WAVE) > 0);
});

test('a splitting warhead becomes several at its split height', () => {
  const w = quiet();
  w.wave = 8;
  const h = warheadOver(w, 0, 100);
  h.splitAt = 300;
  w.warheads.push(h);
  run(w, 2.5);
  assert.equal(w.warheads.length, E.splitInto(8), 'it became three');
  for (const k of w.warheads) assert.ok(Math.abs(k.y0 - 300) < 5, 'all starting where it split');
});

test('the split decision costs the same LCG advances either way, so a seed replays', () => {
  /* Played, not staged: two runs from one seed, one on a wave where nothing
     splits and one where plenty does, stepped until each has released six
     warheads from the top. Release *positions* must match one for one; only
     whether each splits may differ. A split that took an extra advance only
     when it fired would shift every warhead after the first split. */
  const released = (wave) => {
    const w = E.createWorld({ seed: 3 });
    w.wave = wave; w.running = true;
    w.toSpawn = 6; w.spawnT = 0;
    const seen = [];
    for (let i = 0; i < 60 * 30 && seen.length < 6; i++) {
      E.step(w, 1 / 60);
      for (const h of w.warheads) if (h.y0 === -10 && !seen.includes(h)) seen.push(h);
    }
    return seen.map(h => h.x0);
  };
  const calm = released(1), busy = released(12);
  assert.equal(calm.length, 6);
  assert.deepEqual(busy, calm);
});

test('a warhead about to split warns, and one that will not never does', () => {
  const plain = { y: 300, splitAt: null };
  assert.equal(E.splitSoon(plain), 0);
  const h = { y: 100, splitAt: 400 };
  assert.equal(E.splitSoon(h), 0, 'far above its split height: no warning yet');
  h.y = 400 - E.SPLIT_WARN / 2;
  assert.ok(Math.abs(E.splitSoon(h) - 0.5) < 1e-9, 'halfway through the warning');
  h.y = 400;
  assert.equal(E.splitSoon(h), 1);
});

test('a split is announced, so the shell can sound it', () => {
  const seen = [];
  const w = quiet({ fx: { split: (x, y) => seen.push([x, y]) } });
  w.wave = 6;
  const h = warheadOver(w, 1, 280);
  h.splitAt = 300;
  w.warheads.push(h);
  run(w, 0.5);
  assert.equal(seen.length, 1);
});

/* ---------- waves ---------- */

test('a wave ends when everything is released and nothing is left in the air', () => {
  const w = quiet();
  E.step(w, 1 / 60);
  assert.equal(w.waveClear, true);
  assert.equal(w.running, false);
  assert.equal(w.wavesCleared, 1);
});

test('the end of a wave pays for spare ammunition and standing cities', () => {
  const w = quiet();
  w.bases[0].ammo = 4;
  w.cities[0].alive = false;
  E.step(w, 1 / 60);
  const expected = ((4 + 2 * E.BASE_AMMO) * E.AMMO_BONUS + 5 * E.CITY_BONUS) * E.scoreMult(1);
  assert.equal(w.lastBonus.total, expected);
  assert.equal(w.score, expected);
});

test('the next wave rebuilds the batteries, but not the cities', () => {
  const w = quiet();
  w.bases[2].alive = false; w.bases[2].ammo = 0; w.bases[0].ammo = 1;
  w.cities[1].alive = false;
  E.step(w, 1 / 60);
  assert.equal(E.nextWave(w), true);
  assert.equal(w.wave, 2);
  assert.ok(w.bases.every(b => b.alive && b.ammo === E.BASE_AMMO), 'batteries are rebuilt');
  assert.equal(w.cities[1].alive, false, 'a lost city stays lost');
  assert.equal(w.toSpawn, E.waveCount(2));
});

test('nextWave refuses while a wave is still on', () => {
  const w = E.createWorld();
  assert.equal(E.nextWave(w), false);
  assert.equal(w.wave, 1);
});

test('crossing a bonus threshold earns a lost city back at the end of a wave', () => {
  const w = quiet();
  w.cities[4].alive = false;
  w.score = E.BONUS_CITY_EVERY - 1;
  E.step(w, 1 / 60);
  assert.equal(w.cities[4].alive, true);
  assert.equal(w.lastBonus.city, true);
  assert.equal(w.nextBonusCity, 2 * E.BONUS_CITY_EVERY);
});

test('losing the last city ends the run at once', () => {
  const w = quiet();
  w.cities.forEach((c, i) => { c.alive = i === 5; });
  w.warheads.push(warheadOver(w, 5, L.GROUND_Y - 5));
  run(w, 0.3);
  assert.equal(w.over, true);
  assert.equal(w.running, false);
  assert.equal(E.fire(w, 300, 300), false, 'and nothing more can be fired');
});

test('score per warhead rises every second wave, to a cap', () => {
  assert.equal(E.scoreMult(1), 1);
  assert.equal(E.scoreMult(3), 2);
  assert.equal(E.scoreMult(99), 6);
});

test('a reset is a fresh wave 1', () => {
  const w = quiet();
  w.score = 900; w.wave = 6; w.cities[0].alive = false; w.over = true;
  E.resetGame(w);
  assert.equal(w.wave, 1); assert.equal(w.score, 0); assert.equal(w.over, false);
  assert.ok(w.cities.every(c => c.alive));
  assert.equal(w.toSpawn, E.waveCount(1));
});

/* ---------- saving ---------- */

test('a snapshot round-trips through JSON, in-flight objects and all', () => {
  const w = E.createWorld({ seed: 11 });
  w.running = true;
  run(w, 6);
  E.fire(w, 200, 300);
  run(w, 0.2);
  w.cities[2].alive = false;
  const snap = JSON.parse(JSON.stringify(E.snapshot(w)));

  const r = E.createWorld();
  assert.equal(E.hydrate(r, snap), true);
  assert.equal(r.score, w.score);
  assert.equal(r.seed, w.seed);
  assert.deepEqual(r.cities.map(c => c.alive), w.cities.map(c => c.alive));
  assert.equal(r.warheads.length, w.warheads.length);
  assert.equal(r.interceptors.length, w.interceptors.length);
  assert.equal(E.ammoLeft(r), E.ammoLeft(w));
  assert.equal(r.running, false, 'a restored run waits to be resumed');

  // and it plays on identically
  w.running = r.running = true;
  run(w, 4); run(r, 4);
  assert.deepEqual(r.warheads.map(h => Math.round(h.y)), w.warheads.map(h => Math.round(h.y)));
  assert.equal(r.score, w.score);
});

test('a corrupt or foreign snapshot is refused rather than half-applied', () => {
  const good = E.snapshot(E.createWorld());
  for (const bad of [null, 7, 'x', {}, { ...good, wave: 0 }, { ...good, cities: [true] },
    { ...good, bases: [] }, { ...good, warheads: 'no' }, { ...good, warheads: [{}] }]) {
    const w = E.createWorld();
    w.score = 123;
    assert.equal(E.hydrate(w, bad), false);
    assert.equal(w.score, 123, 'and nothing was changed');
  }
});

/* ---------- full-run sanity ---------- */

test('a played run lasts several waves and its state stays sane', () => {
  /* A simple player: every half second, burst ahead of the lowest warhead not
     already being dealt with, leading it by the interceptor's flight time.
     Leading properly matters — the first version of this bot aimed a fixed
     0.45s ahead, missed nearly everything, and lost on wave 2. This one holds
     roughly 8-9 waves; pinned at 5, the wave that will open the next classic,
     so the gate stays reachable by someone who has learned to lead. */
  const w = E.createWorld({ seed: 2026 });
  w.running = true;
  let t = 0, waves = 0;
  const aimed = new Set();
  for (let i = 0; i < 60 * 60 * 10 && !w.over && waves < 6; i++) {
    t += 1 / 60;
    if (t > 0.5) {
      t = 0;
      const free = w.warheads.filter(h => !aimed.has(h));
      if (free.length) {
        const low = free.reduce((a, b) => (b.y > a.y ? b : a));
        const at = (lead) => {
          const k = Math.min(1, (low.d + low.speed * lead) / low.len);
          return { x: low.x0 + (low.tx - low.x0) * k, y: low.y0 + (low.ty - low.y0) * k };
        };
        let lead = 0.6;
        for (let it = 0; it < 3; it++) {
          const p = at(lead), b = w.bases[E.baseFor(w, p.x)];
          if (!b) break;
          lead = Math.hypot(p.x - b.x, p.y - L.GROUND_Y) / E.INT_SPEED + E.BLAST_GROW * 0.6;
        }
        const p = at(lead);
        if (E.fire(w, p.x, Math.min(L.FIRE_FLOOR, p.y))) aimed.add(low);
      }
    }
    E.step(w, 1 / 60);
    if (w.waveClear) { waves++; aimed.clear(); E.nextWave(w); w.running = true; }
    assert.ok(E.ammoLeft(w) >= 0);
    assert.ok(w.warheads.every(h => h.y <= L.GROUND_Y + 1), 'nothing falls through the ground');
  }
  assert.ok(waves >= 5, `a player who leads holds five waves (held ${waves})`);
});
