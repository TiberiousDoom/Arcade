/* Sound effects, synthesized on the fly with WebAudio.

   No audio files ship. Every blip is a few oscillators and an envelope, which
   keeps the app's zero-external-assets, works-offline property intact — the
   whole point of self-hosting the fonts applies here too.

   Two realities this has to respect:
   - A browser won't let an AudioContext make noise until the user has
     interacted with the page, so the context is created lazily and resumed on
     the first gesture.
   - iOS plays WebAudio through the ringer switch regardless of silent mode, so
     a visible mute toggle is not optional. The choice is remembered. */

const MUTE_KEY = 'arcade:muted';

function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
function writeMuted(v) {
  try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* private mode: keep in memory only */ }
}

export function makeAudio() {
  let ctx = null, master = null, noiseBuf = null;
  let muted = readMuted();

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;          // headroom; individual sounds sit under this
      master.connect(ctx.destination);
      // one second of white noise, reused for every crunch
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { ctx = null; }
    return ctx;
  }

  /* Wake the context on anything that is not already running.
     
     This used to check for `'suspended'` alone, which is the whole spec'd set
     of not-running states — and misses the one that actually happens on a
     phone. iOS Safari has a non-standard **`'interrupted'`** state it enters
     when the app is backgrounded, a call arrives, or the screen locks. A
     context sitting in `interrupted` failed the equality check, never got
     resumed, and the game played on in silence for the rest of the session.
     That is the reported "switching apps kills the sound".
     
     Resuming a running context is a no-op, so testing for the negative is both
     correct and cheaper than enumerating states some vendor may add next. */
  function resume() {
    const c = ensure();
    if (!c || c.state === 'running') return;
    // resume() rejects rather than throws when it is called outside a gesture,
    // which is routine on the visibilitychange path — the next tap retries.
    Promise.resolve(c.resume()).catch(() => {});
  }

  /** A single enveloped oscillator. Frequencies glide from f0 to f1. */
  function tone(f0, f1, dur, { type = 'square', gain = 0.3, attack = 0.004, delay = 0 } = {}) {
    const c = ensure();
    if (!c || muted) return;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  /** A short filtered noise burst — the crunch under a break or explosion. */
  function noise(dur, { f = 1400, q = 0.8, gain = 0.25 } = {}) {
    const c = ensure();
    if (!c || muted || !noiseBuf) return;
    const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noiseBuf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);
  }

  return {
    resume,
    get muted() { return muted; },
    toggle() { muted = !muted; writeMuted(muted); if (!muted) resume(); return muted; },

    /* --- the named library, one method per game event --- */

    // Hull Breach
    bounce() { tone(210, 170, 0.05, { type: 'triangle', gain: 0.16 }); },
    brick(row = 0) {
      tone(360 + row * 70, 260 + row * 60, 0.06, { type: 'square', gain: 0.2 });
      noise(0.05, { f: 1800, gain: 0.12 });
    },

    // Feedline
    eat() { tone(520, 700, 0.07, { type: 'square', gain: 0.2 }); },
    bonus() {
      tone(660, 660, 0.08, { type: 'triangle', gain: 0.22 });
      tone(990, 990, 0.1, { type: 'triangle', gain: 0.22, delay: 0.07 });
    },

    // Flak Battery
    // Raised from 0.12 — it was the quietest thing in the library by some way,
    // against 0.16–0.3 everywhere else, and at 50ms through a phone speaker it
    // simply wasn't there. It stays under the impact sounds on purpose: this
    // one fires several times a second and should sit below the hits it causes.
    fire() { tone(680, 300, 0.05, { type: 'sawtooth', gain: 0.2 }); },
    hit() { tone(300, 220, 0.045, { type: 'square', gain: 0.16 }); noise(0.04, { f: 900, gain: 0.1 }); },
    overdrive() { tone(500, 820, 0.12, { type: 'triangle', gain: 0.22 }); },
    overheat() { tone(150, 110, 0.22, { type: 'sawtooth', gain: 0.24 }); },
    breach() { tone(130, 70, 0.3, { type: 'square', gain: 0.28 }); noise(0.2, { f: 300, gain: 0.18 }); },

    // Airburst. Its own sounds rather than borrowed ones. Re-voiced in v55
    // after a phone played them: only the city-lost impact was audible. The
    // burst was a 170→70Hz *sine*, a pure tone below what a phone speaker
    // reproduces, and the launch and catch were soft and short. The rules now,
    // pinned by shared/audio.test.js: a sine or triangle (no harmonics to carry
    // a low note) stays above 300Hz, and every one of these peaks at least as
    // loud as Flak Battery's fire (0.2) — the same lesson that sound learned.
    launch() { tone(380, 1000, 0.1, { type: 'sawtooth', gain: 0.2 }); noise(0.08, { f: 2800, gain: 0.08 }); },
    burst() { tone(300, 120, 0.2, { type: 'square', gain: 0.2 }); noise(0.28, { f: 1000, q: 0.7, gain: 0.2 }); },
    intercept() { tone(1100, 650, 0.08, { type: 'square', gain: 0.2 }); noise(0.06, { f: 3600, gain: 0.12 }); },
    split() { tone(1150, 1500, 0.07, { type: 'triangle', gain: 0.2 }); },
    impact() { tone(110, 42, 0.5, { type: 'sawtooth', gain: 0.3 }); noise(0.45, { f: 220, gain: 0.24 }); },
    dry() { tone(240, 240, 0.05, { type: 'square', gain: 0.2 }); },

    // Shield Wall. Voiced for a phone speaker from the start (see the Airburst
    // note above and shared/audio.test.js): low notes only on square or
    // sawtooth, which carry harmonics a small speaker can play.
    march(pose = 0) { tone(pose ? 150 : 128, pose ? 150 : 128, 0.07, { type: 'square', gain: 0.2 }); },
    laser() { tone(980, 420, 0.07, { type: 'sawtooth', gain: 0.2 }); },
    invaderDown() { tone(620, 180, 0.12, { type: 'square', gain: 0.2 }); noise(0.1, { f: 1800, gain: 0.14 }); },
    gunDown() { tone(320, 70, 0.45, { type: 'sawtooth', gain: 0.3 }); noise(0.4, { f: 400, gain: 0.24 }); },
    chip() { noise(0.06, { f: 1500, gain: 0.2 }); },
    saucer() { tone(700, 940, 0.18, { type: 'triangle', gain: 0.2 }); tone(940, 700, 0.18, { type: 'triangle', gain: 0.2, delay: 0.18 }); },
    saucerDown() {
      tone(520, 1040, 0.1, { type: 'square', gain: 0.22 });
      tone(1040, 1560, 0.12, { type: 'square', gain: 0.22, delay: 0.09 });
    },

    // shared endings
    lose() { tone(300, 90, 0.35, { type: 'sawtooth', gain: 0.28 }); },
    die() { tone(320, 80, 0.4, { type: 'sawtooth', gain: 0.3 }); noise(0.25, { f: 500, gain: 0.15 }); },
  };
}
