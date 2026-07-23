// Renders real frames via node-canvas to catch draw-path crashes the no-op
// stub cannot see. Run: node --test render-test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas } from 'canvas';

// fileURLToPath, not .pathname — on Windows the latter yields a leading slash
// and percent-encoded spaces ("/C:/Users/Thulsa%20Doom/..."), which fs rejects.
const OUT = fileURLToPath(new URL('./serpent-battery-standalone.html', import.meta.url));

function bootReal() {
  let html = readFileSync(OUT, 'utf8')
    .replace('<script type="module">', '<script>')
    .replace('requestAnimationFrame(frame);',
             'window.__world=world;window.__E=E;window.__frame=frame;\nrequestAnimationFrame(frame);');
  const real = createCanvas(880, 620);
  const rctx = real.getContext('2d');
  const errors = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'innerWidth', { value: 1440, writable: true });
      Object.defineProperty(w, 'innerHeight', { value: 900, writable: true });
      w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
      const noop = () => {};
      w.HTMLCanvasElement.prototype.getContext = () => rctx;
      w.HTMLCanvasElement.prototype.setPointerCapture = noop;
      let f = 0;
      w.requestAnimationFrame = cb => { if (f++ < 3) setTimeout(() => cb(f * 16.7), 0); return f; };
      w.onerror = (m, s, l, c, e) => errors.push(String((e && e.stack) || m));
    } });
  return { w: dom.window, errors };
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('every segment type renders on a real canvas without throwing', async () => {
  const { w, errors } = bootReal();
  await wait(300);
  w.document.getElementById('go').click();
  await wait(100);
  w.__world.wave = 6;
  w.__E.spawnWave(w.__world);
  w.__world.chains[0].s = 1400;
  const kinds = new Set(w.__world.chains[0].segs.map(s => s.kind));
  w.__frame(1000);
  assert.ok(kinds.size >= 6, `expected a variety of segment types, got ${[...kinds]}`);
  assert.deepEqual(errors, [], 'render threw');
});

test('the full battery with gun types renders without throwing', async () => {
  const { w, errors } = bootReal();
  await wait(300);
  w.document.getElementById('go').click();
  await wait(100);
  w.__world.battery.guns.push(w.__E.makeGun(w.__world.L.W * 0.32));
  w.__world.battery.guns.push(w.__E.makeGun(w.__world.L.W * 0.68));
  w.__world.gunUnlocks.rail = true;
  w.__E.setGunType(w.__world, 1, 'rail');
  w.__world.battery.guns[0].heat = 0.7;
  w.__E.spawnPickup(w.__world, 440, 380, 'spread');
  w.__world.shake = 0.5;
  w.__frame(1000);
  assert.deepEqual(errors, [], 'render threw with guns, pickup, shake');
});
