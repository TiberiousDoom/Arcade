/* What the sounds actually ask a speaker to do — checked against a recording
   fake AudioContext, since nothing here can listen.

   Written after round 20: Airburst's defensive sounds were inaudible on a phone
   while the city-lost impact came through. A pure tone with no harmonics
   (sine, triangle) carries nothing a phone speaker can reproduce once it drops
   low, and a voice much quieter than the rest of the library disappears under
   it. Flak Battery's fire sound learned the volume half of that in an earlier
   round; this pins both halves for Airburst. */
import test from 'node:test';
import assert from 'node:assert/strict';

const voices = [];
class FakeParam {
  constructor(v = 0) { this.value = v; this.points = []; }   // the default value is not a sound
  setValueAtTime(v) { this.points.push(v); }
  linearRampToValueAtTime(v) { this.points.push(v); }
  exponentialRampToValueAtTime(v) { this.points.push(v); }
}
class FakeContext {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = {}; }
  resume() { return Promise.resolve(); }
  createGain() { return { gain: new FakeParam(1), connect: (n) => n } }
  createOscillator() {
    const osc = { kind: 'tone', type: 'sine', frequency: new FakeParam(440), connect(g) { osc.gainNode = g; return g; },
      start() { voices.push(osc); }, stop() {} };
    return osc;
  }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  createBiquadFilter() {
    const f = { type: '', frequency: { value: 0 }, Q: { value: 0 }, connect(g) { f.gainNode = g; return g; } };
    return f;
  }
  createBufferSource() {
    const src = { kind: 'noise', connect(f) { src.filter = f; return f; },
      get gainNode() { return src.filter.gainNode; },
      start() { voices.push(src); }, stop() {} };
    return src;
  }
}
globalThis.window = { AudioContext: FakeContext };

const { makeAudio } = await import('./audio.js');
const audio = makeAudio();

/** Play one named sound and return the voices it started. */
function record(name) {
  voices.length = 0;
  audio[name]();
  return voices.map(v => ({
    kind: v.kind,
    type: v.type,
    minHz: v.kind === 'tone' ? Math.min(...v.frequency.points.filter(f => f > 1)) : v.filter.frequency.value,
    peak: Math.max(...v.gainNode.gain.points),
  }));
}

const AIRBURST = ['launch', 'burst', 'intercept', 'split', 'impact', 'dry'];

test('every Airburst sound plays something', () => {
  for (const name of AIRBURST) assert.ok(record(name).length > 0, `${name} started no voice`);
});

test('no pure tone in Airburst drops below what a phone speaker reproduces', () => {
  for (const name of AIRBURST) {
    for (const v of record(name)) {
      if (v.kind !== 'tone' || (v.type !== 'sine' && v.type !== 'triangle')) continue;
      assert.ok(v.minHz >= 300, `${name}: a ${v.type} at ${v.minHz}Hz has no harmonics to be heard through`);
    }
  }
});

test('every Airburst sound is at least as loud as Flak Battery\'s fire', () => {
  const fire = Math.max(...record('fire').map(v => v.peak));
  for (const name of AIRBURST) {
    const loudest = Math.max(...record(name).map(v => v.peak));
    assert.ok(loudest >= fire, `${name} peaks at ${loudest}, under the fire sound's ${fire}`);
  }
});
