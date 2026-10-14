# games/

Each game lives in its own directory here, as `games/<name>/`, following the engine/shell split described in [CLAUDE.md](../CLAUDE.md): a pure-logic engine (no DOM, no canvas, no timers) plus a thin rendering/input shell.

- **[flak-battery/](flak-battery/)** — the template for this split, and by volume the largest: continuous physics, per-emplacement upgrades, and a research tree that persists across runs.
- **[hull-breach/](hull-breach/)** — a smaller, newer example of the same split. Easier to read end to end if you're learning the pattern.
- **[feedline/](feedline/)** — grid/tick-based rather than continuous physics, so the engine owns its own tick clock. Also the first game with touch (swipe) controls.
- **[choke-point/](choke-point/)** — a grid tower-defense, and the fullest example of the shared-module wiring (fit, fx, glow, help, scores, audio, plus a controls strip).
- **[airburst/](airburst/)** — Missile Command, the newest and the smallest complete example of a game on the pattern: engine, shell, render and resume tests.

Every game has `engine.js` + `engine.test.js`, a `<name>.html` shell, and a `CLAUDE.md` with its design notes (Claude Code loads it in that directory; read it before changing the game); all five
add a `render-test.mjs`, and the four with mid-run saves add a `resume-test.mjs`.
**There are no build artifacts here** — Flak Battery's generated
`flak-battery-standalone.html` was retired in v26 (a stale copy meant the render
test was checking old code). The render and resume tests inline the real shell in
memory via `tools/inline.mjs` instead.

The shells load `engine.js` as an ES module, so serve the repo (`python -m http.server 8123`) rather than opening the `.html` files directly.

See [STATUS.md](../STATUS.md) for the current plan and open decisions.
