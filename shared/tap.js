/* A press you slide off is a cancel.
 *
 * Reported at v46: tap a button, drag your finger off it, let go — and the
 * action still happened. That is not a bug in any one shell, it is how touch
 * works: a touch pointer gets **implicit pointer capture** on the element it
 * went down on, so every `pointermove`/`pointerup` is retargeted back to that
 * element however far the finger has travelled, and the synthesized `click`
 * lands on it too. On a mouse the browser does the right thing by itself (a
 * mousedown on a button and a mouseup outside fire `click` on their common
 * ancestor, not on the button), which is exactly why this only shows up on the
 * phone — and why it survived every desk check.
 *
 * So the pointer's real position has to be asked for rather than inferred:
 * `elementFromPoint` at the release point tells us where the finger actually
 * was, and if that is outside the button the press went down on, the click is
 * swallowed in the capture phase before any shell's handler sees it.
 *
 * Two deliberate limits:
 *
 * - **It only ever cancels what it is sure about.** If `elementFromPoint`
 *   cannot answer (it returns null outside the viewport, and in jsdom, which
 *   lays nothing out), the tap is allowed. A guard that eats real taps when it
 *   is confused is worse than the bug it fixes.
 * - **It only governs `click`.** Controls that must answer on *press* — a
 *   gameplay canvas, Feedline's d-pad, Flak Battery's trigger — are untouched,
 *   because for those the press *is* the action and waiting for the release
 *   would cost the responsiveness they exist for.
 */

/** Buttons, and the links that are dressed as buttons. */
const HIT = 'button, a';
const targetOf = (el) => (el && el.closest ? el.closest(HIT) : null);

/** Where the pointer really is, or null if that cannot be established. */
function elementAt(e) {
  if (typeof document.elementFromPoint !== 'function') return null;
  if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return null;
  return document.elementFromPoint(e.clientX, e.clientY);
}

/** Install the guard. Idempotent — a shell that calls it twice gets one guard. */
export function guardTaps() {
  if (guardTaps.on) return;
  guardTaps.on = true;

  let armed = null;        // the control this press started on
  let cancelled = false;   // …and whether the finger has since left it

  const clear = () => {
    if (armed) armed.classList.remove('tapOff');
    armed = null; cancelled = false;
  };

  /* `capture: true` throughout: this has to run before the shells' own
     listeners, since the whole job is stopping one of them from firing. */
  addEventListener('pointerdown', (e) => {
    clear();
    armed = targetOf(e.target);
  }, { capture: true });

  addEventListener('pointermove', (e) => {
    if (!armed) return;
    const over = elementAt(e);
    if (!over) return;                       // cannot tell: leave it armed
    cancelled = !armed.contains(over);
    /* The press styling has to let go too. Under implicit capture `:active`
       stays lit while the finger is away, which tells the player the tap is
       still live — the opposite of what is about to happen. */
    armed.classList.toggle('tapOff', cancelled);
  }, { capture: true });

  addEventListener('pointerup', (e) => {
    if (!armed) return;
    const over = elementAt(e);
    if (over) cancelled = !armed.contains(over);
    if (armed) armed.classList.remove('tapOff');
  }, { capture: true });

  // the gesture was taken away from us (a scroll, a system edge swipe)
  addEventListener('pointercancel', () => { if (armed) cancelled = true; }, { capture: true });

  addEventListener('click', (e) => {
    const hit = targetOf(e.target);
    if (hit && hit === armed && cancelled) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    clear();
  }, { capture: true });
}
