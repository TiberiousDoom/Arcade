/* Player-set effect preferences, plus the one device effect they gate.

   `prefers-reduced-motion` is honoured everywhere already, but it is an
   all-or-nothing OS switch: a player who wants the game to move and just
   doesn't want the screen thrown around has no way to say so. These are that
   dial. Three settings, each a single value the shells read every frame:

     shake    0 | 0.5 | 1     multiplier on screen shake
     numbers  boolean         damage/score floaters drawn at all
     haptics  boolean         whether buzz() does anything

   **Reduced motion still wins.** These narrow what a player sees; they can't
   turn an effect back on that the OS asked to be suppressed. Shells keep
   their existing `reduce` checks and multiply by `shake` on top.

   Haptics lives here rather than in its own module because the Vibration API
   *is* one line — the part worth writing down is the gate in front of it.
   It is a progressive enhancement in the strict sense: absent on iOS Safari
   entirely, blocked by silent/DND, and requires a real user gesture, so
   nothing may ever be load-bearing on it firing.

   Same guarded-localStorage shape as scores.js and levels.js: storage
   genuinely throws in Safari private browsing and under enterprise policy,
   and losing a preference is not worth crashing a game over. */

const KEY = 'arcade:prefs';

const memory = new Map();
let warned = false;

function readRaw() {
  try { return localStorage.getItem(KEY); }
  catch { return memory.get(KEY) ?? null; }
}
function writeRaw(v) {
  try { localStorage.setItem(KEY, v); }
  catch {
    memory.set(KEY, v);
    if (!warned) { warned = true; console.info('Preferences kept in memory only — storage unavailable.'); }
  }
}

const DEFAULTS = { shake: 1, numbers: true, haptics: true };

/** Anything stored is player-supplied and may be a half-written or hand-edited
 *  value, so every field is validated rather than trusted. An unreadable blob
 *  degrades to the defaults instead of poisoning the draw loop with NaN. */
function load() {
  const raw = readRaw();
  if (!raw) return { ...DEFAULTS };
  try {
    const o = JSON.parse(raw);
    return {
      shake: [0, 0.5, 1].includes(o.shake) ? o.shake : DEFAULTS.shake,
      numbers: typeof o.numbers === 'boolean' ? o.numbers : DEFAULTS.numbers,
      haptics: typeof o.haptics === 'boolean' ? o.haptics : DEFAULTS.haptics,
    };
  } catch { return { ...DEFAULTS }; }
}

/** The live preferences. Read it every frame — `set` mutates this object in
 *  place, so a shell that captured it at startup still sees changes. */
export const prefs = load();

export function set(key, value) {
  if (!(key in DEFAULTS)) return;
  prefs[key] = value;
  writeRaw(JSON.stringify(prefs));
}

/** Does this device do haptics at all? Used to hide the toggle where the
 *  answer is permanently no, rather than offering a switch that does nothing. */
export const hasHaptics = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/**
 * A short tactile tick. Silently does nothing when the player has turned
 * haptics off, when the device has no vibration motor, or when the browser
 * refuses (no gesture yet, silent mode). Never call this per frame — it is
 * for moments, and a continuous buzz is the fastest way to make a player
 * disable it permanently.
 *
 * @param ms  duration, or a pattern array as the Vibration API accepts
 */
export function buzz(ms = 12) {
  if (!prefs.haptics || !hasHaptics) return;
  try { navigator.vibrate(ms); } catch { /* blocked by policy — not worth reporting */ }
}
