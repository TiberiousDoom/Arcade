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
- **[fx.js](fx.js)** — `makeFx({ reduce, gravity })` gives particles and a
  screen-flash value. Used by Breakout and Snake. **Serpent Battery does not
  use it**: its bits and floaters live on the world object and are stepped
  inside its engine, which predates this module and wasn't worth churning.

Deliberately *not* shared: the banner show/hide logic. It looked like a
duplicate, but Serpent Battery's variant hides a legend and two hint
paragraphs, so sharing it would mean a config-heavy wrapper around about six
lines per game.

Also not shared: the engines' `step()` signatures. Those differ per game on
purpose — see [CLAUDE.md](../CLAUDE.md).
