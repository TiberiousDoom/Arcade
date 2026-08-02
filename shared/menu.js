/* One corner button + panel, replacing the old three (help/mute/pause).

   Those were independent modules each mounting an always-visible button on
   top of the board, which meant three overlapping hit targets a thumb could
   catch instead of the game underneath. This folds all three into one menu:
   opening it pauses the run (the same contract shared/pause.js used to
   provide — shells still gate their frame loop on `paused`/`pause()`/
   `resume()`/`toggle()`), and the panel holds the mute toggle, the controls
   reference (what shared/help.js used to show behind its own button), and
   — only where a game passes `onLevels` — a way into level-select. */

import { BUILD_LABEL } from './version.js';

/**
 * @param stage    the positioned element the button and panel are placed in
 * @param audio    the object returned by shared/audio.js's makeAudio()
 * @param title    heading for the panel
 * @param rows     [[term, description], …] — the controls table
 * @param notes    array of short strings shown under the table
 * @param lore     one line of setting, shown under the title (see help.js's
 *                 old doc comment — still one sentence, still skippable)
 * @param onLevels optional — if passed, a "Levels" button appears and calls
 *                 this instead of resuming when tapped (Hull Breach only)
 * @param extra    optional — an HTMLElement of game-specific settings
 *                 (Feedline's sensitivity slider and input-mode choice),
 *                 inserted between the action row and the controls table
 */
export function makeMenu({ stage, audio, title, rows = [], notes = [], lore = '', onLevels, extra }) {
  const btn = document.createElement('button');
  btn.id = 'menuBtn';
  btn.type = 'button';
  btn.textContent = '☰';
  btn.setAttribute('aria-label', 'Menu');
  btn.setAttribute('aria-expanded', 'false');

  const panel = document.createElement('div');
  panel.id = 'menuPanel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Menu');

  const resumeBtn = document.createElement('button');
  resumeBtn.type = 'button';
  resumeBtn.id = 'menuResume';
  resumeBtn.textContent = 'Resume';

  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.id = 'menuMute';
  const syncMute = () => {
    muteBtn.textContent = audio.muted ? 'Unmute' : 'Mute';
    muteBtn.classList.toggle('off', audio.muted);
  };
  syncMute();
  muteBtn.addEventListener('click', () => { audio.toggle(); syncMute(); });

  const actions = document.createElement('div');
  actions.className = 'menuActions';
  actions.append(resumeBtn, muteBtn);

  if (onLevels) {
    const levelsBtn = document.createElement('button');
    levelsBtn.type = 'button';
    levelsBtn.id = 'menuLevels';
    levelsBtn.textContent = 'Levels';
    levelsBtn.addEventListener('click', () => { set(false); onLevels(); });
    actions.append(levelsBtn);
  }

  panel.innerHTML =
    `<h2>${title}</h2>` +
    (lore ? `<p class="lore">${lore}</p>` : '');
  panel.appendChild(actions);
  if (extra) panel.appendChild(extra);
  panel.insertAdjacentHTML('beforeend',
    `<dl>${rows.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl>` +
    (notes.length ? `<ul>${notes.map(n => `<li>${n}</li>`).join('')}</ul>` : '') +
    // which build this is — a diagnostic, not something a player needs while playing
    `<p class="build">${BUILD_LABEL}</p>`);

  stage.append(btn, panel);

  let paused = false;
  const set = (open) => {
    paused = open;
    panel.classList.toggle('on', open);
    btn.classList.toggle('on', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  const toggle = () => set(!paused);

  btn.addEventListener('click', toggle);
  resumeBtn.addEventListener('click', () => set(false));
  // tapping the backdrop dismisses, but taps on the panel's own content must not
  panel.addEventListener('click', e => { if (e.target === panel) set(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && paused) set(false); });

  // audio can't play until the user has interacted with the page at all —
  // resume it on the first gesture, same as the old mute button did
  const wake = () => audio.resume();
  addEventListener('pointerdown', wake, { once: true });
  addEventListener('keydown', wake, { once: true });

  return { get paused() { return paused; }, pause: () => set(true), resume: () => set(false), toggle };
}
