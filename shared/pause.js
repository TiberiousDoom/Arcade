/* A pause button in the corner of the board, matched to the "?" help button.

   No game had a player-triggered pause before this — only internal booleans
   that halted the loop behind a shop/banner. This is the first one a player
   can reach directly, mid-run. */

export function makePause({ stage, onToggle }) {
  const btn = document.createElement('button');
  btn.id = 'pauseBtn';
  btn.type = 'button';
  btn.textContent = '❚❚';
  btn.setAttribute('aria-label', 'Pause');
  btn.setAttribute('aria-pressed', 'false');

  const overlay = document.createElement('div');
  overlay.id = 'pauseOverlay';
  overlay.innerHTML = '<span>Paused</span>';

  stage.append(btn, overlay);

  let paused = false;
  const set = (v) => {
    paused = v;
    overlay.classList.toggle('on', paused);
    btn.classList.toggle('on', paused);
    btn.textContent = paused ? '▶' : '❚❚';
    btn.setAttribute('aria-pressed', String(paused));
    btn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
    if (onToggle) onToggle(paused);
  };
  const toggle = () => set(!paused);

  btn.addEventListener('click', toggle);
  // tapping the overlay resumes, same "tap the backdrop to dismiss" as help
  overlay.addEventListener('click', () => set(false));
  addEventListener('keydown', e => { if (e.key === 'Escape' && paused) set(false); });

  return { get paused() { return paused; }, pause: () => set(true), resume: () => set(false), toggle };
}
