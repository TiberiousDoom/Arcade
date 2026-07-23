# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A collection of standalone HTML5 canvas games. There is no bundler, no `package.json`, and no build step for day-to-day work — each game is either a single `.html` file or a small set of files that a browser can load directly (`file://` or any static server).

Three games live here:

1. **Serpent Battery** (`games/serpent-battery/`) — a tower-defense/shooter with a pure-logic engine (`engine.js`) covered by a large unit-test suite. The first game in the `games/<name>/` layout, and the template every other game follows.
2. **Angle Iron** (`games/angle-iron/`) — a fresh, smaller build on the same engine/shell split. Good starting point for seeing the pattern without Serpent Battery's volume.
3. **Live Wire** (`games/live-wire/`) — the first grid/tick-based game rather than continuous physics. Worth reading if you want to see how far the engine/shell split bends for a different genre.

An earlier `arcade_games.html` (a monolithic Breakout/Missile/Snake/Tetris/Invaders cabinet — those were its names) was scrapped — see [docs/DECISIONS.md](docs/DECISIONS.md). Those games will be rebuilt from scratch under `games/` on the engine/shell pattern when we get to them.

## Session workflow

This is a solo, part-time project with potentially long gaps (weeks or months) between sessions. Read **[STATUS.md](STATUS.md)** first — it's the current "what's playable / what's next" snapshot, kept fresh each session rather than left to go stale. **[docs/DECISIONS.md](docs/DECISIONS.md)** has the reasoning behind past architectural choices, append-only — check it before re-deciding something that looks unusual.

At the end of a session: update STATUS.md (what changed, what's next, any newly open questions), add an entry to docs/DECISIONS.md for any real decision made, and write commit messages that explain intent — with month-long gaps, `git log` is effectively documentation too.

## Commands

No `package.json` exists — install test dependencies ad hoc if needed.

```bash
# Run the engine unit tests (pure logic, no deps beyond Node's built-in test runner)
node --test games/serpent-battery/engine.test.js
node --test games/angle-iron/engine.test.js

# Run every engine suite at once
node --test games/*/engine.test.js

# Run a single test by name
node --test --test-name-pattern="a breach costs a life" games/serpent-battery/engine.test.js

# Play a game locally. The shells import engine.js as an ES module, which
# browsers refuse to load over file:// — so serve the repo rather than opening
# the .html directly. (Also wired up as the "arcade-static" preview config in
# .claude/launch.json.)
python -m http.server 8123
# then open http://localhost:8123/games/angle-iron/angle-iron.html

# Regenerate Serpent Battery's single-file build. Run after changing engine.js,
# serpent-battery.html, or anything in shared/.
node games/serpent-battery/build.mjs

# Render smoke test — boots the real game in jsdom + node-canvas and drives a
# few frames, catching draw-path crashes the logic tests can't see.
# Requires `jsdom` and `canvas` (not installed by default — no package.json/node_modules present):
npm install --no-save jsdom canvas
node --test games/serpent-battery/render-test.mjs
```

There is no lint config in the repo.

**Verifying a shell in a headless/background browser:** `requestAnimationFrame` gets throttled hard there (measured at ~0.1fps), so the game simulates in slow motion and any judgement about pacing — or even "is it moving at all" — will be wrong. Don't fight it: temporarily expose the world at the bottom of the shell's module (`window.__world = world; window.__frame = frame;`), then either drive `__frame(t)` with your own advancing timestamps or call engine functions directly, assert on state, and remove the hook afterward. Note that death/level-clear banners fire on a false→true *edge* inside the frame loop, so killing the world with direct `tick()`/`step()` calls skips them — drive it through `__frame` when that's what you're checking.

## Architecture: Serpent Battery (`games/serpent-battery/`)

- **[engine.js](games/serpent-battery/engine.js)** is the entire simulation: geometry, enemy chains, guns/battery, upgrades, pickups, and the `step(w, dt, firing)` function that advances the world by one frame. It has **no DOM, no canvas, no timers, no randomness beyond a seeded LCG** (`rollDrop`) — this is what makes it fully unit-testable. Never add `document`/`canvas`/`Date.now()`/`Math.random()` calls here; keep those in the HTML shell.
- **[serpent-battery.html](games/serpent-battery/serpent-battery.html)** is the playable shell: it `import`s `engine.js` as a module, owns all rendering (canvas draw calls), input (pointer/keyboard/touch aiming), the shop UI, and the `requestAnimationFrame` loop. Game *rules* belong in `engine.js`; anything about pixels, DOM, or timing belongs here.
- **[serpent-battery-standalone.html](games/serpent-battery/serpent-battery-standalone.html)** is a generated single-file build with the engine, `shared/fit.js`, and `shared/theme.css` all inlined. **Never edit it directly** — regenerate with `node games/serpent-battery/build.mjs` after touching `engine.js`, `serpent-battery.html`, or anything in `shared/`. `render-test.mjs` tests *this* file, not `serpent-battery.html`, so a stale standalone means the render test isn't checking current code.
- **[build.mjs](games/serpent-battery/build.mjs)** is that generator. It inlines each ES module as an IIFE returning *all* its top-level names (the shell reaches for a few that aren't formally exported), embeds the self-hosted fonts as base64 data URIs (the inlined CSS sits in a different directory, so `./fonts/...` would resolve to nothing), and throws if any JS `import` survives. Note its stray-import guard matches `^\s*import\s` specifically — a plain substring check trips over CSS's legitimate `@import url(...)`. The result is genuinely self-contained: it loads with **zero** subresource requests.
- **[engine.test.js](games/serpent-battery/engine.test.js)** is organized by subsystem (path geometry → chains/segments → shielding/deflection → recoil → overdrive/heat → aiming curves → upgrades → battery/guns → pickups → splitting → breach/wave/run lifecycle → full-run simulations). When adding engine behavior, find the matching section rather than appending to the end.
- Core simulation model, useful when tracing a bug:
  - `world` (built by `createWorld`) holds `chains` (arrays of segments moving along a precomputed serpentine `path`), `battery` (multiple `guns`, shared aim/streak/overdrive), `shots`, `pickups`, `bits`/`floaters` (pure visual junk).
  - Enemies are **chains of segments** referenced by arc-length `s` along the path (see `atS`/`segPos`); killing a middle segment produces `recoil` (chain gets pushed back) instead of the chain instantly shortening.
  - `KIND` defines enemy archetypes (armored, volatile, shielded, regen, splitter, carrier, head) with per-kind special-cased behavior inside `damageSeg`/`stepChains`.
  - Overdrive/heat is per-gun (`heat`, `cool`, `locked`) but streak/tier is shared on the battery; `stats(w)` resolves the four upgrade branches (`barrel`/`chamber`/`optics`/`munitions`) into the current effective numbers — read from `stats()`, not the raw `UPGRADES` tables.
  - One `step(w, dt, firing)` call per frame drives cannon → pickups → chains → shots → breach/wave-clear checks, in that order; hit-stop short-circuits everything else at the top of `step`.

## Architecture: Angle Iron (`games/angle-iron/`)

- **[engine.js](games/angle-iron/engine.js)** — same rules as Serpent Battery's engine: no DOM, no canvas, no timers, and here **no randomness at all** (level layouts come from pure arithmetic on row/col, so level N is byte-identical every run and in every test). `step(w, dt)` advances ball flight and its consequences; that's it.
- **[angle-iron.html](games/angle-iron/angle-iron.html)** is the shell: rendering, pointer/keyboard input, particles, banners, and the `requestAnimationFrame` loop.
- **Division of labour is deliberately different from Serpent Battery's `step(w, dt, firing)`**: the paddle is moved by the shell calling `setPaddle`/`nudgePaddle` (both clamp to the walls), and the ball is served by the shell calling `launch(w)`. `step` never reads input. This keeps pointer-vs-keyboard control entirely in the shell.
- **Two layouts**: `LAYOUT` (800×600 landscape) and `LAYOUT_TALL` (600×1200 portrait, with a `THUMB` band). The shell picks one at load via `matchMedia('(max-aspect-ratio: 4/5)')` and passes it as `createWorld({ layout })`.
  - `FLOOR` (`H - THUMB`), **not `H`**, is the line a ball dies past. The thumb band is canvas below the floor where a finger can rest — the paddle tracks only horizontal position, so steering from down there works without a hand over the court. Draw code must use `FLOOR` for the court border and the loss strip.
  - `levelSpeed(level, L)` scales by `L.FLOOR / REF_FLOOR` so a ball crosses either board in the **same time**. Absolute px/s would make the taller portrait board play slower and easier. Same principle as Serpent Battery deriving wave speed from path length; there's a test asserting traversal time is layout-independent.
- Simulation model:
  - `w.balls` is an array (not a single ball) so multiball is a later addition rather than a rewrite. `w.held` means a ball is racked on the paddle awaiting `launch`; while held, `step` skips ball physics.
  - **The paddle is a protractor, not a wall.** Where the ball lands across the paddle sets its outgoing angle (`PADDLE_MAX_ANGLE`, ~60° at the edges); speed is preserved on every bounce, so a ball's speed is fixed for its whole life at `levelSpeed(level)`. That mapping is the entire control scheme — don't "fix" it into a plain reflection.
  - Collision runs in **sub-steps** no longer than the ball's radius, so a fast ball can't tunnel through a brick or the paddle in one frame. `rectHit` resolves against the Minkowski-expanded rectangle and picks the least-penetration face.
  - `brickBounce` deliberately resolves **at most one brick per sub-step** (the deepest overlap) — resolving two at a corner reflects twice and sends the ball back into itself.
  - An empty brick field means "level cleared," so a world built with no bricks will flag `levelClear` on its first step. Tests that want bare ball physics need a decoy brick (see `engine.test.js`).
- **[engine.test.js](games/angle-iron/engine.test.js)** is organized by subsystem (brick field geometry → collision primitives → paddle → launch → ball dynamics → bricks → lives/level flow → full-run sanity), same convention as Serpent Battery.
- There is **no standalone single-file build and no render smoke test** for Angle Iron yet — Serpent Battery has both. If draw-path crashes start slipping through, port `render-test.mjs` over.

## Architecture: Live Wire (`games/live-wire/`)

- **[engine.js](games/live-wire/engine.js)** — grid/tick model rather than continuous physics. The board is a 32×24 grid of 25px cells (800×600, same as Angle Iron, so the two could share a cabinet frame without rescaling), or `LAYOUT_TALL`'s 18×34 in portrait, picked by the shell the same way Angle Iron does it.
  - **No pace rescaling, unlike Angle Iron** — the tick rate is seconds *per cell*, so reaction time per move is already board-independent. A portrait grid is just a slightly shorter game to fill. There's a test asserting both layouts tick at the same rate.
  - **No thumb band either**: steering is a flick, not a hold, so a finger is never parked over the board.
- **The engine owns the tick clock.** `step(w, dt)` accumulates time and fires as many ticks as have come due; `tick(w)` is exported separately so tests can drive exact discrete steps. Pace lives in the engine because *pace is the difficulty curve here* (`tickRate` shortens with every meal) — it's a game rule, not a rendering concern. This is the opposite call from Angle Iron, where the shell drives everything.
- Randomness is a seeded LCG (`rand`), same one Serpent Battery uses. `createWorld({ seed })` makes food sequences reproducible — the shell seeds from the clock, tests pass a fixed seed.
- Model details worth knowing before editing:
  - `w.wire` is an array of cells, **head at index 0**. Growth is deferred via a `w.grow` counter rather than appending immediately, so a meal lengthens the wire over the next few ticks.
  - **The tail-vacating rule**: the cell the tail is leaving is legal to move into, so chasing your own tail isn't a death. But a wire mid-growth (`w.grow > 0`) keeps its tail put, so that cell *is* solid. Both cases are tested; don't "simplify" the collision check into a plain body scan.
  - `turn()` buffers up to `MAX_QUEUE` (2) direction changes and validates each against the **last queued** direction, not the current one — otherwise a fast up-then-left jink inside one tick would be wrongly rejected as a reversal.
  - Filling the board is a **win** (`w.won`), reached when `spawnFood` finds no free cell. One life, no levels — the genre convention.
  - `tickProgress(w)` exists purely so the shell can interpolate the head sliding out of its previous cell and the tail retracting; derived from engine state so the animation can't drift from the simulation.
- **[live-wire.html](games/live-wire/live-wire.html)** adds swipe input (dominant-axis flick) alongside arrows/WASD — the first touch control in the repo, since Live Wire is unplayable on a phone without it.
- **[engine.test.js](games/live-wire/engine.test.js)** — board/setup → determinism → movement → turning → eating/growth → bonus → death → time accumulator → win → reset → full-run invariants (no duplicated cells, body stays contiguous).

## Architecture: `games/` and `shared/`

Games follow a per-game engine/shell split modeled on Serpent Battery: pure logic with no DOM/canvas/timers, plus a thin rendering/input shell, living under `games/<name>/`. Cross-game code (input handling, canvas fit-to-screen, theme, cabinet/menu shell) belongs in `shared/`, added only once a second game actually needs it — don't speculatively build `shared/` helpers ahead of real code demanding them, which is the failure mode that sank the old `arcade_games.html` (it referenced a `shared/` folder that was never built).

`shared/` now holds the code all three shells had duplicated — see [shared/README.md](shared/README.md) for the full contract:

- **`shared/theme.css`** — the cabinet look, plus the `@font-face` rules. Shells link it and override only the custom properties (`--accent`, `--accent-hot`, `--accent-ink`, `--board-max`). **Don't redeclare shared rules in a game's local `<style>`** — add a property hook to the theme instead.
- **`shared/fonts/`** — self-hosted WOFF2 (Chivo Mono variable 300–700, Archivo Black 400), `latin` subset only, both OFL-1.1 with license text shipped alongside. Nothing loads from a CDN any more, so the games work offline; keep it that way, since offline operation is the point of the planned service worker.
- **`shared/fit.js`** — `makeFit(...)` sizes the board and owns the resize/orientation listeners. It performs the first fit itself, so shells must not also call the returned function at startup.
- **`shared/fx.js`** — `makeFx(...)` for particles and the screen-flash value. Angle Iron and Live Wire use it. **Serpent Battery deliberately does not** — its bits/floaters live on the world and are stepped inside its engine, and rewiring that was judged not worth the churn.

Deliberately not shared: banner show/hide (Serpent's variant hides a legend and two hint paragraphs, so sharing it would be a config-heavy wrapper around ~6 lines each), and the engine `step()` signatures.

The engine/shell **seam legitimately differs per game** and should not be forced into a single shape: Serpent Battery's `step(w, dt, firing)` takes input, Angle Iron's `step(w, dt)` takes none (the shell drives the paddle), and Live Wire's engine owns its own tick clock. What's shared is the *principle* — pure logic, no DOM/canvas/timers — not the signature.
