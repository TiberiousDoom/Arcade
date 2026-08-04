/* Fit a fixed-size game board into whatever space is left on screen.

   Every shell needs this and every shell had its own copy. The board keeps its
   aspect ratio and is sized to whichever of width-or-height runs out first, so
   the whole playfield is visible without scrolling. */

/** Every vertical pixel the page spends on something that isn't the board:
 *  the body's padding (which varies by media query *and* by safe-area inset),
 *  every sibling of the stage inside `#shell` (header, footer, a controls
 *  strip), and the flex gaps between them.
 *
 *  This used to be a hardcoded 34 covering "the gaps and padding the layout
 *  adds", which was wrong twice over: it didn't track the `≤560px` media
 *  query dropping body padding from 16px to 8px, and it knew nothing about
 *  `env(safe-area-inset-*)`. Over-reserving shrinks the board, which is what
 *  left dead space around it on a phone. Measuring costs one layout read per
 *  fit and is simply correct. */
function furnitureHeight(stage) {
  const bs = getComputedStyle(document.body);
  let used = parseFloat(bs.paddingTop) + parseFloat(bs.paddingBottom);

  const shell = stage.parentElement;
  if (!shell) return used;

  const ss = getComputedStyle(shell);
  const gap = parseFloat(ss.rowGap || ss.gap) || 0;

  // Anything in the shell that isn't the board is furniture. A `display:none`
  // element (the footer, below 560px) measures 0, so it drops out for free.
  let visible = 0;
  for (const el of shell.children) {
    if (getComputedStyle(el).display === 'none') continue;
    visible++;
    if (el !== stage) used += el.getBoundingClientRect().height;
  }
  return used + Math.max(0, visible - 1) * gap;
}

/**
 * @param canvas   the game canvas, whose CSS size this sets
 * @param stage    the positioned wrapper around the canvas
 * @param board    `{ w, h }` in board units. Read on every fit, so a game that
 *                 swaps to a portrait layout can mutate it in place.
 * @param extra    optional () => number of additional vertical pixels to
 *                 reserve. Only needed for furniture that is *not* a sibling
 *                 of the stage inside `#shell` — anything that is gets
 *                 measured automatically, so passing it here as well would
 *                 double-count it.
 * @returns the fit function, already bound to resize/orientation events and
 *          called once.
 */
export function makeFit({ canvas, stage, board, extra }) {
  function fit() {
    const below = typeof extra === 'function' ? (extra() || 0) : 0;
    const avail = Math.max(200, innerHeight - furnitureHeight(stage) - below);

    const ratio = board.w / board.h;
    const stageW = stage.clientWidth || innerWidth;
    const h = Math.min(avail, stageW / ratio);

    canvas.style.height = h + 'px';
    canvas.style.width = (h * ratio) + 'px';
    canvas.style.maxWidth = '100%';
  }

  addEventListener('resize', fit);
  // orientation settles a beat after the event, so re-fit once it has
  addEventListener('orientationchange', () => setTimeout(fit, 150));
  if (window.visualViewport) {
    // iOS Safari's collapsing address bar changes visualViewport's height
    // via a scroll event, not always a resize — miss it and the header
    // drifts out of sync with the fitted board over a long session.
    visualViewport.addEventListener('resize', fit);
    visualViewport.addEventListener('scroll', fit);
  }

  fit();
  return fit;
}
