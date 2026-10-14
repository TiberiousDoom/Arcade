# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A collection of standalone HTML5 canvas games. There is no bundler, no `package.json`, and no build step for day-to-day work — each game is either a single `.html` file or a small set of files that a browser can load directly (`file://` or any static server).

Four games live here, split across two cabinets — Flak Battery and Choke Point in the invasion cabinet ([index.html](index.html)), Feedline and Hull Breach in the classics ([classics.html](classics.html)):

1. **Flak Battery** (`games/flak-battery/`) — a tower-defense/shooter with a pure-logic engine (`engine.js`) covered by a large unit-test suite. The first game in the `games/<name>/` layout, and the template every other game follows.
2. **Hull Breach** (`games/hull-breach/`) — a fresh, smaller build on the same engine/shell split. Good starting point for seeing the pattern without Flak Battery's volume.
3. **Feedline** (`games/feedline/`) — the first grid/tick-based game rather than continuous physics. Worth reading if you want to see how far the engine/shell split bends for a different genre.
4. **Choke Point** (`games/choke-point/`) — a grid tower-defense: build auto-firing towers to stop surges flowing along a fixed path. Placement + economy rather than reflex, and the fullest example of the shared-module wiring (fit, fx, help, scores, audio, plus a controls strip).

An earlier `arcade_games.html` (a monolithic Breakout/Missile/Snake/Tetris/Invaders cabinet — those were its names) was scrapped — see [docs/DECISIONS.md](docs/DECISIONS.md). Those games will be rebuilt from scratch under `games/` on the engine/shell pattern when we get to them.

## Session workflow

Planned-but-unbuilt work lives in its own `docs/*-plan.md` file. **[docs/pre-release-plan.md](docs/pre-release-plan.md) is open** (delete landscape, Choke Point’s gradual unlock, three new classics). A plan file is deleted once the work ships and its reasoning moves to DECISIONS.md, so if one exists it is live.

This is a solo, part-time project with potentially long gaps (weeks or months) between sessions. Read **[STATUS.md](STATUS.md)** first — it's the current "what's playable / what's next" snapshot, kept fresh each session rather than left to go stale. **[docs/DECISIONS.md](docs/DECISIONS.md)** has the reasoning behind past architectural choices, append-only — check it before re-deciding something that looks unusual.

**The playtesting comes from a real phone.** Every "V*n* Feedback" round in STATUS.md is someone playing on glass, so touch, portrait and the safe-area fit work are the primary path rather than an untested one — and a frame time measured in a desktop browser is a direction, not a verdict. [docs/TESTING.md](docs/TESTING.md) is the live device checklist for the current build; when a section is settled the outcome moves to STATUS.md and the section is deleted rather than left to rot.

At the end of a session: update STATUS.md (what changed, what's next, any newly open questions), add an entry to docs/DECISIONS.md for any real decision made, and write commit messages that explain intent — with month-long gaps, `git log` is effectively documentation too.

**Before you commit — the whole gate, in one place. Nothing here is automated: there is no CI, no workflow in `.github/`, and no pre-commit hook, so a check you don't run is a check that never runs.**

```
Run     node --test games/*/engine.test.js shared/*.test.js       # always
        node --test games/*/render-test.mjs games/*/resume-test.mjs  # if a shell or shared/ changed
Bump    CACHE_VERSION in sw.js  +  BUILD in shared/version.js     # if any file the app loads changed
        …and add any new file to sw.js's PRECACHE list
Update  STATUS.md (what changed, what's next, newly open questions)
        docs/DECISIONS.md, if a real decision was made
```

Each line is expanded where it belongs — the version bump under Commands (with why a stale one strands returning players), the render/resume tests in the command block, STATUS/DECISIONS just above.

## Commands

No `package.json` exists — install test dependencies ad hoc if needed.

```bash
# Run the engine unit tests (pure logic, no deps beyond Node's built-in test runner)
node --test games/flak-battery/engine.test.js
node --test games/hull-breach/engine.test.js
node --test games/choke-point/engine.test.js

# Run every engine suite at once, plus shared/ (one suite: version.test.js)
node --test games/*/engine.test.js shared/*.test.js

# Run a single test by name
node --test --test-name-pattern="a breach costs a life" games/flak-battery/engine.test.js

# Play a game locally. The shells import engine.js as an ES module, which
# browsers refuse to load over file:// — so serve the repo rather than opening
# the .html directly. (Also wired up as the "arcade-static" preview config in
# .claude/launch.json.)
python -m http.server 8123
# then open http://localhost:8123/games/hull-breach/hull-breach.html

# Render smoke tests — boot the real shells in jsdom + node-canvas and drive
# frames, catching draw-path crashes the logic tests can't see. All four games
# have one. Requires `jsdom` and `canvas` (not installed by default — there is
# no package.json/node_modules):
npm install --no-save jsdom canvas
node --test games/*/render-test.mjs

# Resume tests — the mid-run save/restore flow end to end in a real DOM with a
# real localStorage: play, background, reload, press Continue. The engine suites
# already cover snapshot/hydrate as pure functions; these cover the shell half
# (save written on the right beat, banner offers it, Continue restores). Only
# the three games with saves have one — Feedline is one-life score-attack.
node --test games/{flak-battery,hull-breach,choke-point}/resume-test.mjs

# Everything at once
node --test games/*/engine.test.js shared/*.test.js games/*/render-test.mjs games/*/resume-test.mjs

# Rebuild the gun-art review bench after changing any portrait art. Writes
# docs/art/gun-bench.html from the current sources; open it directly, no server.
node tools/gun-bench.mjs

# Look at a game from here — boots the real shell against node-canvas and drives
# frames by hand, so it returns an honest picture where a headless browser
# returns a blank one. Same jsdom/canvas install as the render tests.
node tools/screenshot.mjs games/choke-point/choke-point.html out.png
```

Both `render-test.mjs` and `resume-test.mjs` boot the real shell through
[tools/render-harness.mjs](tools/render-harness.mjs) (which inlines it via
`tools/inline.mjs`) — so a change to a shell's `<script>`, its imports, or
anything in `shared/` is exercised by them without any checked-in build artifact.

There is no lint config in the repo.

**⚠ Adding or changing a file the app loads? Bump `CACHE_VERSION` in [sw.js](sw.js) *and* `BUILD` in [shared/version.js](shared/version.js).** `shared/version.test.js` fails if the two disagree, so the test suite will catch a half-bump — but nothing catches forgetting both. The service worker precaches the whole app and serves cache-first without revalidating, so a stale version string means returning players keep the old build indefinitely. Nothing automates this, and no CI will catch it after the fact. If you add a new file, add it to the `PRECACHE` list too — otherwise it only reaches the cache on second visit, and the app is broken on a first-run offline launch.

**Verifying a shell in a headless/background browser:** `requestAnimationFrame` gets throttled hard there (measured at ~0.1fps), so the game simulates in slow motion and any judgement about pacing — or even "is it moving at all" — will be wrong. Don't fight it: temporarily expose the world at the bottom of the shell's module (`window.__world = world; window.__frame = frame;`), then either drive `__frame(t)` with your own advancing timestamps or call engine functions directly, assert on state, and remove the hook afterward. Note that death/level-clear banners fire on a false→true *edge* inside the frame loop, so killing the world with direct `tick()`/`step()` calls skips them — drive it through `__frame` when that's what you're checking.

**Reviewing the gun art:** the render harness cannot judge it — dark fills under additive glow render far dimmer in node-canvas than on a GPU, and because nearly every pixel of a portrait carries some alpha, an "is there ink here" assertion answers yes wherever it is pointed (two attempts to pin the cannon's barrel elevation both passed with the gun lying flat). Build and open the bench instead: `node tools/gun-bench.mjs` writes **[docs/art/gun-bench.html](docs/art/gun-bench.html)** — the five guns drawn live, with elevation, barrel-count and a gamma-lifted "silhouette" exposure, and no server needed. It is **generated, never hand-edited**: everything it draws is lifted from `shared/glow.js`, the engine and the shell at build time, so a bench built from a clean tree cannot drift from the game. Rebuild it after any change to the art. **Draw art on the bench, review it, then port it** — see DECISIONS 2026-08-19.

**Looking at a game from here:** `node tools/screenshot.mjs <shell.html> out.png` boots the real shell against node-canvas and drives frames by hand, so it returns an honest picture where a headless browser returns a blank one. `--frames`, `--width`/`--height`, `--no-start` (capture the opening banner) and Feedline's `--grow`. Needs the same `jsdom`/`canvas` install as the render tests.

## Architecture: the four games

Each game has its own `CLAUDE.md` beside its code with the full design notes (Claude Code loads it automatically when working in that directory): the simulation model, the balance invariants tests pin, and why the odd-looking parts are that way. **Read that game's notes before changing its engine or shell.** What follows is only what breaks things if you miss it.

Every engine is pure: no DOM, no canvas, no timers, no `Date.now()`, no `Math.random()` (randomness is a seeded LCG, and Hull Breach has none at all). Game *rules* go in `engine.js`; pixels, DOM and timing go in the `.html` shell. Each `engine.test.js` is organized by subsystem, so put a new test in the matching section rather than at the end.

- **Flak Battery** — [games/flak-battery/CLAUDE.md](games/flak-battery/CLAUDE.md). `step(w, dt, firing)` takes input. Numbers come only from `gunStats(w, type)` and `stats(w, gun)` (never `GUN_TYPES` or `UPGRADES` directly), and the shop prints them only through `statDisplay`. Upgrades, barrels and retrofits are per-emplacement, so their verbs take a mount index. Scrap is per-run and research points persist; `w.gunUnlocks` is derived from research and deliberately left out of the snapshot. The shell owns storage, not the engine.
- **Hull Breach** — [games/hull-breach/CLAUDE.md](games/hull-breach/CLAUDE.md). `step(w, dt)` reads no input: the shell moves the paddle (`setPaddle`/`nudgePaddle`) and serves (`launch`). A ball dies past `FLOOR`, not `H`. The paddle sets the outgoing angle by where the ball lands, so don't "fix" it into a reflection.
- **Feedline** — [games/feedline/CLAUDE.md](games/feedline/CLAUDE.md). The engine owns the tick clock (pace is the difficulty curve). Don't simplify the tail-vacating collision rule or the turn queue's check against the last *queued* direction; both are tested.
- **Choke Point** — [games/choke-point/CLAUDE.md](games/choke-point/CLAUDE.md). Numbers come only from `stats(w, tower)` and prices only from `buildCost(w, type)`. The armory persists across runs and the shell stores it. `w.unlocked` is derived and never snapshotted. Players see "circuit", never "route".

## Architecture: the PWA layer

- **[manifest.webmanifest](manifest.webmanifest)** — installable metadata. `start_url`/`scope` are `./` (relative, so the app survives being served from a subpath), `display: standalone`, `orientation: portrait`. Every game still handles both orientations; the lock is the portrait-only *flag* (DECISIONS 2026-07-27), which only binds once installed, so a browser tab can still go sideways and the landscape layouts stay live until that flag becomes a deletion.
- **[sw.js](sw.js)** — precaches the entire app on install, then serves **cache-first** with a network fallback, plus a cabinet fallback for failed navigations. Cache-first is right here (everything is static, offline play is the point) but see the version warning above.
- **[index.html](index.html) and [classics.html](classics.html)** — the two cabinets. `index.html` is the invasion (Flak Battery, Choke Point) and the navigation fallback for a failed request; `classics.html` is the classics (Feedline, Hull Breach). Both are the same page with a different roster, self-contained apart from `scores.js` (personal bests on the cards), `unlocks.js` (which cards are dimmed) and `version.js`, and each links to the other. **A gate never crosses cabinets** — each has its own ungated opener, or someone who wants Snake would have to play a tower defense first.
- **[shared/pwa.js](shared/pwa.js)** — registration, imported by all six pages (two cabinets + four games) so landing directly on a game installs the cache too. Resolves the worker URL via `import.meta.url` rather than an absolute `/sw.js`, again for subpath safety.
- **[tools/make-icons.mjs](tools/make-icons.mjs)** — regenerates `shared/icons/` (needs `npm install --no-save canvas`). The icons are committed; only re-run when the mark changes.
- The PWA head tags are duplicated across the game HTML files. That's deliberate — injecting them from JS is unreliable for iOS, and there's no build step to template them.

## Architecture: `games/` and `shared/`

Games follow a per-game engine/shell split modeled on Flak Battery: pure logic with no DOM/canvas/timers, plus a thin rendering/input shell, living under `games/<name>/`. Cross-game code (input handling, canvas fit-to-screen, theme, cabinet/menu shell) belongs in `shared/`, added only once a second game actually needs it — don't speculatively build `shared/` helpers ahead of real code demanding them, which is the failure mode that sank the old `arcade_games.html` (it referenced a `shared/` folder that was never built).

`shared/` now holds the code all three shells had duplicated — see [shared/README.md](shared/README.md) for the full contract:

- **`shared/theme.css`** — the cabinet look, plus the `@font-face` rules. Shells link it and override only the custom properties (`--accent`, `--accent-hot`, `--accent-ink`, `--board-max`). **Don't redeclare shared rules in a game's local `<style>`** — add a property hook to the theme instead.
- **`shared/fonts/`** — self-hosted WOFF2 (Chivo Mono variable 300–700, Archivo Black 400), `latin` subset only, both OFL-1.1 with license text shipped alongside. Nothing loads from a CDN any more, so the games work offline; keep it that way, since offline operation is the point of the planned service worker.
- **`shared/theme.css`'s `--btn-radius`** is how a shell rounds its buttons (default `0`, Choke Point sets `10px`). Add a hook like that rather than restating the shared button rules locally.
- **`shared/fit.js`** — `makeFit(...)` sizes the board and owns the resize/orientation listeners. It performs the first fit itself, so shells must not also call the returned function at startup. `extra` is only for furniture *outside* `#shell` (everything inside is measured, so passing it twice double-counts). **`fillWidth`** inverts the usual priority — spend the whole stage width and let the page scroll rather than paying a height shortfall out of the board's width. Only Choke Point uses it, and a shell that asks for it must also add `body.scrolls` or the overflow is unreachable. **When judging any of this, simulate the safe-area insets**: a desktop browser reports them as 0, and that is exactly how v26 shipped a gutter fix that did nothing on a phone.
- **`shared/version.js`** — one app-wide `BUILD` string, shown in every help panel and on the cabinet. Deliberately **one version for the whole app, not one per game**: four hand-maintained numbers with no release process would drift instantly, and the only question anyone asks is which deploy they're looking at. Kept in lockstep with `sw.js`'s `CACHE_VERSION` by `shared/version.test.js`.
- **`shared/fx.js`** — `makeFx(...)` for particles and the screen-flash value. Hull Breach and Feedline use it. **Flak Battery deliberately does not** — its bits/floaters live on the world and are stepped inside its engine, and rewiring that was judged not worth the churn.
- **`shared/tap.js`** — `guardTaps()`, installed by all four shells: a press slid off a control and released elsewhere is cancelled rather than completed. Touch pointers get **implicit capture**, so the browser retargets the release *and the click* back to the element the press began on; a mouse fires the click on the common ancestor instead, which is why this is invisible at a desk. It governs `click` only — anything that must answer on *press* (a gameplay canvas, Feedline's d-pad, Flak Battery's trigger) is untouched, and the corollary is that **a control which acts on press cannot be guarded, so one that needn't act on press shouldn't** (Choke Point's palette was committing its selection in `pointerdown`, and no longer does; since v50 its board builds on release too, and only on the cell pressed). It cancels only when `elementFromPoint` positively places the finger elsewhere: when it cannot tell, the tap goes through.
- **Hover styles are gated behind `@media (hover: hover)`, everywhere.** A touch screen has no "not hovering": the browser leaves the last-tapped element in `:hover` until something else is tapped, so every button a player pressed stayed lit. `:active` is the press state on a phone; hover is for pointers.
- **`shared/glow.js`** — the vector/CRT art primitives every shell draws with (`glowStroke`, `glowDot`, `inkDot`, `extrude`/`extrudeDisc`/`extrudeRect`, `cube`, `fadeFrame`, `scanlines`). Two rules here have each cost a build already, and [shared/README.md](shared/README.md) has the full five: **additive compositing cannot darken** — `glowStroke`/`glowDot` brighten what's underneath, so anything meant to read as recessed or shadowed must be painted with the normal composite (`inkDot` or a plain fill); and **static content accumulates under `fadeFrame`**, settling at roughly `1/fade` times the alpha you wrote, so write static alphas about a third of what you want. The art also has one absolute: **invaders are cubes, defenders are spheres**, everywhere, because shape alone is what keeps a busy board readable.
- **`shared/menu.js`** — `makeMenu(...)`, the single corner button + panel every game uses for pause, mute and instructions. It replaced three always-visible buttons that were eating tappable board area. **Opening the panel pauses the run**; shells gate their frame loop on the returned `{ paused, pause(), resume(), toggle() }`. The panel also hosts the effect toggles, built from `shared/prefs.js`, so a game gets them by using the menu rather than by wiring anything.
- **`shared/prefs.js`** — the three player-set effect dials (`shake` 0/0.5/1, `numbers`, `haptics`) plus `buzz()`, the one device effect they gate. Shells read `prefs.shake` **every frame** and multiply it into their existing `reduce` check — **`prefers-reduced-motion` still wins**, these only narrow what is drawn, they can never switch an effect back on that the OS asked to be suppressed. `hasHaptics` is false on iOS Safari entirely and vibration is blocked by silent/DND, so nothing may be load-bearing on `buzz()` firing. Same guarded-localStorage shape as `scores.js`.
- **`shared/resume.js`** — storage for mid-run saves: keys, build-stamping, and the fact that localStorage throws in real situations (Safari private browsing, storage disabled by policy). The **engines** own what a snapshot *is* (`snapshot`/`hydrate`); this owns none of it. Used by Flak Battery, Hull Breach and Choke Point — **not** Feedline, which is one-life score-attack.
- **`shared/audio.js`** (`makeAudio()`, all effects synthesized in WebAudio, no files), **`shared/scores.js`** (`best()`/`submit()` for local personal bests) and **`shared/levels.js`** (highest level reached, for Hull Breach's level select) all use the same guarded-localStorage shape — losing a personal best is never worth crashing a game over.
- **`shared/unlocks.js`** — the first-play-through gate. Each game calls `recordProgress(id, value)` as it plays (a Feedline run finishing, the current wave in Flak Battery / Choke Point), and the cabinets ask `isUnlocked(id)` / `lockLabel(id)` to decide whether a card is dimmed. `GATES` is the whole ruleset, in one object — and it holds **one chain per cabinet**, never one across both. **The gate is enforced on the cabinet only** — direct URLs and the PWA's shortcuts still open any game, on purpose (see DECISIONS.md, 2026-08-04). Don't record progress via `scores.js`'s `submit()`: it only writes on an improved score, so a weak run after a strong one would record nothing.

Deliberately not shared: banner show/hide (Flak Battery's variant hides a legend and two hint paragraphs, so sharing it would be a config-heavy wrapper around ~6 lines each), and the engine `step()` signatures.

The engine/shell **seam legitimately differs per game** and should not be forced into a single shape: Flak Battery's `step(w, dt, firing)` takes input, Hull Breach's `step(w, dt)` takes none (the shell drives the paddle), and Feedline's engine owns its own tick clock. What's shared is the *principle* — pure logic, no DOM/canvas/timers — not the signature.
