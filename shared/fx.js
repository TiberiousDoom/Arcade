/* Cosmetic particles and a screen flash — the junk that makes a hit feel like
   a hit. Deliberately outside the engines: none of this affects play, and
   keeping it here is what lets the engines stay deterministic (this module
   uses Math.random freely, which engine code must never do).

   Serpent Battery does NOT use this: its bits and floaters live on the world
   object and are stepped inside its engine, which predates this module. Left
   alone rather than churned — see docs/DECISIONS.md. */

export function makeFx({ reduce = false, gravity = 220 } = {}) {
  const bits = [];
  let flash = 0;

  return {
    bits,

    /** Current screen-flash intensity, 0..1. The shell decides what to paint
     *  with it — a red floor strip, a full-screen tint, whatever suits. */
    get flash() { return flash; },

    /** Spray particles from a point. A no-op under prefers-reduced-motion, so
     *  callers never need to check. */
    burst(x, y, col, n = 12, speed = 150) {
      if (reduce) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = speed * (0.25 + Math.random());
        bits.push({
          x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: .3 + Math.random() * .35,
          col,
        });
      }
    },

    /** Kick the screen flash, keeping any brighter flash already running. */
    hit(amount = .5) { flash = Math.max(flash, amount); },

    step(dt, decay = 1.6) {
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.life -= dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vy += gravity * dt;
        if (b.life <= 0) bits.splice(i, 1);
      }
      if (flash > 0) flash = Math.max(0, flash - dt * decay);
    },

    draw(ctx) {
      for (const b of bits) {
        ctx.globalAlpha = Math.max(0, Math.min(1, b.life * 2.5));
        ctx.fillStyle = b.col;
        ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;
    },

    /** Wipe everything — call on restart so a death flash doesn't bleed into
     *  the fresh run. */
    clear() { bits.length = 0; flash = 0; },
  };
}
