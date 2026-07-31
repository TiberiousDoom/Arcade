/* A "?" button in the corner of the board that opens the instructions.

   Instructions used to live in the opening banner, which meant they were long,
   they pushed the Play button down, and on a phone they simply ran off the
   bottom of the screen. Behind a button they can be as detailed as they like
   and cost no space until asked for. */

import { BUILD_LABEL } from './version.js';

/**
 * @param stage    the positioned element the button and panel are placed in
 * @param title    heading for the panel
 * @param rows     [[term, description], …] — the controls table
 * @param notes    array of short strings shown under the table
 * @param lore     one line of setting, shown under the title. The four games
 *                 share a story, and this is the whole of how it gets told
 *                 in-game — deliberately one sentence a player can ignore,
 *                 rather than cutscenes nobody asked for.
 */
export function makeHelp({ stage, title, rows = [], notes = [], lore = '' }) {
  const btn = document.createElement('button');
  btn.id = 'helpBtn';
  btn.type = 'button';
  btn.textContent = '?';
  btn.setAttribute('aria-label', 'How to play');
  btn.setAttribute('aria-expanded', 'false');

  const panel = document.createElement('div');
  panel.id = 'helpPanel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'How to play');

  panel.innerHTML =
    `<h2>${title}</h2>` +
    (lore ? `<p class="lore">${lore}</p>` : '') +
    `<dl>${rows.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl>` +
    (notes.length ? `<ul>${notes.map(n => `<li>${n}</li>`).join('')}</ul>` : '') +
    `<button type="button" id="helpClose">Got it</button>` +
    // which build this is. Here rather than next to the title because it is a
    // diagnostic — the answer to "did my phone actually pick up the new code?"
    // — and not something a player needs while playing.
    `<p class="build">${BUILD_LABEL}</p>`;

  stage.append(btn, panel);

  const set = (open) => {
    panel.classList.toggle('on', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  const toggle = () => set(!panel.classList.contains('on'));

  btn.addEventListener('click', toggle);
  panel.querySelector('#helpClose').addEventListener('click', () => set(false));
  // tapping the backdrop dismisses, but taps on the text inside must not
  panel.addEventListener('click', e => { if (e.target === panel) set(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });

  return { open: () => set(true), close: () => set(false), toggle };
}
