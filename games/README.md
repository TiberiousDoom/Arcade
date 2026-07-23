# games/

Each game lives in its own directory here, as `games/<name>/`, following the engine/shell split described in [CLAUDE.md](../CLAUDE.md): a pure-logic engine (no DOM, no canvas, no timers) plus a thin rendering/input shell.

- **[serpent-battery/](serpent-battery/)** — the template for this split: `engine.js` / `engine.test.js` / `render-test.mjs` (logic + tests) and `serpent-battery.html` / `serpent-battery-standalone.html` (playable shells).

See [STATUS.md](../STATUS.md) for the current plan and open decisions.
