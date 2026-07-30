# shared/

Cross-game code, extracted from the three game shells once they had genuinely
duplicated it (not designed up front — see [docs/DECISIONS.md](../docs/DECISIONS.md)).

- **[theme.css](theme.css)** — the cabinet look: palette, page reset, header,
  `#stage`, `#banner`, buttons, footer, media queries. Every shell links it and
  then adds only its own rules. Per-game variation goes through the custom
  properties (`--accent`, `--accent-hot`, `--accent-ink`, `--board-max`) rather
  than redeclaring rules. Also declares the `@font-face` rules.
- **[fonts/](fonts/)** — self-hosted WOFF2 files, so the games render offline.
  See [fonts/README.md](fonts/README.md) for provenance and OFL licensing.
- **[fit.js](fit.js)** — `makeFit({ canvas, stage, board, extra })` sizes a
  fixed-ratio board into the space left on screen, and wires the
  resize/orientation listeners. `board` is read on every fit, so a game can
  mutate it in place when it swaps to a portrait layout. `extra` reserves room
  for furniture below the board (Serpent Battery's touch pad).
- **[audio.js](audio.js)** — `makeAudio()` synthesizes all sound effects with
  WebAudio (no files), plus `mountAudioToggle(...)` for the mute button. Guarded
  against no-AudioContext environments and remembers mute in localStorage.
- **[scores.js](scores.js)** — `best()` / `submit()` for local personal bests.
- **[help.js](help.js)** — `makeHelp(...)` builds the "?" instructions overlay.
- **[fx.js](fx.js)** — `makeFx({ reduce, gravity })` gives particles and a
  screen-flash value. Used by Angle Iron and Live Wire. **Serpent Battery does not
  use it**: its bits and floaters live on the world object and are stepped
  inside its engine, which predates this module and wasn't worth churning.
- **[version.js](version.js)** — one app-wide `BUILD` string, shown in every
  help panel and on the cabinet. Kept in lockstep with `sw.js`'s
  `CACHE_VERSION` by [version.test.js](version.test.js).
- **[resume.js](resume.js)** — storage for mid-run saves. The *engines* own what
  a snapshot is (`snapshot`/`hydrate`); this only handles keys, build-stamping
  and the fact that localStorage may throw. Used by Circuit Breaker, Serpent
  Battery and Angle Iron; **not** Live Wire, which is one-life score-attack.
- **[glow.js](glow.js)** — the vector/CRT art primitives: `glowStroke` (the
  multi-pass emissive stroke everything else is built on), `glowDot`, `inkDot`,
  `extrude`/`extrudeDisc`/`extrudeRect`, `fadeFrame` and `scanlines`. Piloted on
  Live Wire. Two things to know before using it:
  - **Static content accumulates** under `fadeFrame`, settling at roughly
    `1/fade` times the alpha you wrote — a grid drawn at 0.5 ends up looking
    like 1.5. Write static alphas about a third of what you want.
  - **Extrusion suits discrete objects on a dark board**, not the tip of an
    already-glowing form: it fills a dark body before rimming it, which on the
    end of a glowing tube punches a visible hole. Live Wire's head is a bright
    `glowDot` for exactly this reason.

Deliberately *not* shared: the banner show/hide logic. It looked like a
duplicate, but Serpent Battery's variant hides a legend and two hint
paragraphs, so sharing it would mean a config-heavy wrapper around about six
lines per game.

Also not shared: the engines' `step()` signatures. Those differ per game on
purpose — see [CLAUDE.md](../CLAUDE.md).
