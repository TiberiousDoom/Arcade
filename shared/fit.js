/* Fit a fixed-size game board into whatever space is left on screen.

   Every shell needs this and every shell had its own copy. The board keeps its
   aspect ratio and is sized to whichever of width-or-height runs out first, so
   the whole playfield is visible without scrolling. */

/** Space consumed by page furniture above and below the board — the header,
 *  the flex gaps, and the body padding. Measured, not guessed, except for this
 *  constant which covers the gaps and padding the layout adds. */
const GAP_AND_PADDING = 34;

/**
 * @param canvas   the game canvas, whose CSS size this sets
 * @param stage    the positioned wrapper around the canvas
 * @param board    `{ w, h }` in board units. Read on every fit, so a game that
 *                 swaps to a portrait layout can mutate it in place.
 * @param extra    optional () => number of additional vertical pixels to
 *                 reserve, for shells with furniture below the board (Serpent
 *                 Battery's touch pad).
 * @returns the fit function, already bound to resize/orientation events and
 *          called once.
 */
export function makeFit({ canvas, stage, board, extra }) {
  function fit() {
    const header = document.querySelector('header');
    const headerH = header ? header.getBoundingClientRect().height : 0;
    const below = typeof extra === 'function' ? (extra() || 0) : 0;

    const used = headerH + below + GAP_AND_PADDING;
    const avail = Math.max(200, innerHeight - used);

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
  if (window.visualViewport) visualViewport.addEventListener('resize', fit);

  fit();
  return fit;
}
