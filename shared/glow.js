/* The vector/CRT look, as Canvas 2D primitives.

   The reference is vector-arcade hardware — Asteroids, Tempest, Battlezone —
   where a beam draws lines onto phosphor rather than filling pixels. Three
   ideas do all the work:

   1. An emissive stroke is the SAME path drawn several times, widest and
      dimmest first, narrowest and brightest last, composited with 'lighter' so
      the passes accumulate. That stacking is what makes a line read as
      emitting light rather than as being painted.
   2. Volume comes from a dark opaque body with a glowing rim and a second face
      offset behind it — not from shading, which emissive line art cannot do.
      See `extrude`.
   3. Phosphor persistence is a frame that is faded rather than cleared.

   Deliberately NOT using `shadowBlur`, which is the obvious API for glow and is
   brutally slow — measurably so on a phone. Multi-pass strokes get the same
   look for a fraction of the cost and give control over the falloff.

   Deliberately NOT using WebGL either, which would make real bloom cheap. The
   render tests boot every shell against node-canvas, which is 2D only, so
   moving to WebGL would throw away the draw-path safety net across all four
   games. That trade is not worth it for a look this achieves anyway. */

/** Default falloff: [widthMultiplier, alpha] per pass, dim-and-wide first. */
export const GLOW_PASSES = [[6, 0.10], [3.5, 0.20], [2, 0.45], [1, 1]];
/** A cheaper two-pass falloff for things drawn many times per frame. */
export const GLOW_PASSES_CHEAP = [[3.5, 0.16], [1, 0.9]];

/**
 * Stroke a path so it glows.
 * @param ctx    canvas context
 * @param path   (ctx) => void — issues the path commands, no stroke/fill
 * @param col    CSS colour
 * @param width  width of the bright core
 * @param passes falloff table; use GLOW_PASSES_CHEAP in hot loops
 * @param intensity 0..1 dimmer. Has to be a parameter rather than an outer
 *        `globalAlpha`, because each pass sets its own alpha and would
 *        overwrite it — a caller wrapping this in save/globalAlpha/restore
 *        silently gets no effect at all.
 */
export function glowStroke(ctx, path, col, width = 2, passes = GLOW_PASSES, intensity = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = col;
  for (const [mult, alpha] of passes) {
    ctx.globalAlpha = alpha * intensity;
    ctx.lineWidth = width * mult;
    ctx.beginPath();
    path(ctx);
    ctx.stroke();
  }
  ctx.restore();
}

/** A solid emissive dot of radius `r`, with the glow spreading *outside* it —
 *  for sparks, food, impact flashes.
 *
 *  `r` is the size of the opaque core, not the outer extent of the haze, and
 *  that matters: an earlier version put the only full-alpha pass at r * 0.5, so
 *  a caller asking for a 7px pellet got a 3px core wrapped in a soft smudge.
 *  It rendered — it just read as a faint blur rather than an object, and Live
 *  Wire's food became genuinely hard to spot on a phone. A dot should be as
 *  solid as the flat art it replaces, and merely gain a halo.
 *
 *  Stacked filled discs rather than a stroked circle, because a stroked circle
 *  is an annulus and comes out as a donut at small radii. */
export function glowDot(ctx, x, y, r, col, intensity = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = col;
  for (const [mult, alpha] of [[2.2, 0.08], [1.6, 0.16], [1.2, 0.30], [1, 1]]) {
    ctx.globalAlpha = alpha * intensity;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.4, r * mult), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Paint over an emissive shape in a dark colour — pupils, vents, panel lines.
 *  Additive compositing cannot darken, so detail *inside* a glowing object has
 *  to be drawn normally, on top. */
export function inkDot(ctx, x, y, r, col = 'rgba(6,20,17,.92)') {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw a shape as a solid object with thickness: a dark face offset behind,
 * the connecting edges, then a dark body in front with a glowing rim.
 *
 * The body fill matters as much as the glow — it occludes whatever is behind,
 * which is what stops a screen full of emissive line art turning into soup.
 *
 * @param path   (ctx, dx, dy) => void — the outline, offset by (dx, dy)
 * @param opts.depth  how far the back face sits down-right
 * @param opts.body   fill for the front face
 */
export function extrude(ctx, path, col, {
  depth = 7, width = 1.8, body = 'rgba(8,18,22,.97)', back = 'rgba(6,14,17,.95)',
  edges = null,
} = {}) {
  const dx = depth * 0.55, dy = depth;

  // back face, filled dark then rimmed very faintly so it reads as *behind*
  ctx.save();
  ctx.fillStyle = back;
  ctx.beginPath(); path(ctx, dx, dy); ctx.fill();
  ctx.restore();
  glowStroke(ctx, c => path(c, dx, dy), col, 1, [[4, 0.05], [2, 0.10]]);

  // the side edges connecting the faces — this is what says "extruded" rather
  // than "two copies". Supplied per-shape because only the caller knows which
  // points are on the silhouette.
  if (edges) glowStroke(ctx, c => edges(c, dx, dy), col, 1, [[3, 0.07], [1.2, 0.18]]);

  // front face: opaque body, then the bright rim
  ctx.save();
  ctx.fillStyle = body;
  ctx.beginPath(); path(ctx, 0, 0); ctx.fill();
  ctx.restore();
  glowStroke(ctx, c => path(c, 0, 0), col, width);
}

/** Convenience: an extruded disc, with the specular arc that reads as curvature. */
export function extrudeDisc(ctx, x, y, r, col, opts = {}) {
  const depth = opts.depth ?? 7;
  extrude(ctx, (c, dx, dy) => c.arc(x + dx, y + dy, r, 0, Math.PI * 2), col, opts);
  // a short highlight on the lit side. Small, but it is the single cue that
  // makes a flat disc read as a domed one.
  glowStroke(ctx, c => c.arc(x, y, r * 0.62, Math.PI * 1.15, Math.PI * 1.75),
    '#ffffff', 1, [[3, 0.08], [1.4, 0.22]]);
}

/** The invaders' shape.
 *
 *  A square face with a second face offset behind it and the silhouette corners
 *  joined, which reads as a cube without needing a projection matrix. `rot`
 *  tumbles it — worth using for things in flight, wrong for things marching in
 *  formation on the ground.
 *
 *  This is the whole visual half of the setting: everything the invaders are
 *  made of is a cube, everything the defenders are made of is a sphere. Keeping
 *  that rule absolute is what makes a board readable at a glance, so resist
 *  drawing a "sort of rounded" anything. */
export function cube(ctx, x, y, size, col, {
  depth = size * 0.34, rot = 0, width = 2,
  body = 'rgba(10,20,26,.97)', back = 'rgba(7,14,18,.95)',
} = {}) {
  const h = size / 2;
  const c = Math.cos(rot), s = Math.sin(rot);
  // corners of the front face, rotated about the centre
  const pt = (sx, sy) => ({ x: x + (sx * h * c - sy * h * s), y: y + (sx * h * s + sy * h * c) });
  const F = [pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)];
  const dx = depth * 0.55, dy = depth;

  const face = (c2, ox, oy) => {
    c2.moveTo(F[0].x + ox, F[0].y + oy);
    for (let i = 1; i < 4; i++) c2.lineTo(F[i].x + ox, F[i].y + oy);
    c2.closePath();
  };

  ctx.save();
  ctx.fillStyle = back;
  ctx.beginPath(); face(ctx, dx, dy); ctx.fill();
  ctx.restore();
  glowStroke(ctx, c2 => face(c2, dx, dy), col, 1, [[4, 0.05], [2, 0.10]]);

  // the joining edges are what say "solid", not "two squares"
  glowStroke(ctx, c2 => {
    for (const p of F) { c2.moveTo(p.x, p.y); c2.lineTo(p.x + dx, p.y + dy); }
  }, col, 1, [[3, 0.07], [1.2, 0.18]]);

  ctx.save();
  ctx.fillStyle = body;
  ctx.beginPath(); face(ctx, 0, 0); ctx.fill();
  ctx.restore();
  glowStroke(ctx, c2 => face(c2, 0, 0), col, width);
}

/** Convenience: an extruded axis-aligned rectangle. */
export function extrudeRect(ctx, x, y, w, h, col, opts = {}) {
  const depth = opts.depth ?? 6;
  extrude(ctx, (c, dx, dy) => c.rect(x + dx, y + dy, w, h), col, {
    ...opts, depth,
    edges: (c, dx, dy) => {
      // only the two silhouette corners need connecting for an axis-aligned box
      c.moveTo(x + w, y);         c.lineTo(x + w + dx, y + dy);
      c.moveTo(x + w, y + h);     c.lineTo(x + w + dx, y + h + dy);
      c.moveTo(x, y + h);         c.lineTo(x + dx, y + h + dy);
    },
  });
}

/**
 * Phosphor persistence: fade the frame instead of clearing it, so moving
 * objects leave a decaying trail.
 *
 * `reduce` short-circuits to a hard clear — trails are exactly the kind of
 * motion `prefers-reduced-motion` exists to suppress, and a game that ignores
 * it is worse than one that never had the effect.
 */
export function fadeFrame(ctx, w, h, { amount = 0.28, bg = '#050b0d', reduce = false } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  if (reduce) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  } else {
    // the alpha is applied to the background colour, so the trail decays
    // toward the board colour rather than toward transparent
    ctx.globalAlpha = amount;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

/** Horizontal scanlines. Cheap, and the thing that most says "CRT". */
export function scanlines(ctx, w, h, { gap = 3, strength = 0.28 } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgba(0,0,0,${strength})`;
  for (let y = 0; y < h; y += gap) ctx.fillRect(0, y, w, 1);
  ctx.restore();
}
