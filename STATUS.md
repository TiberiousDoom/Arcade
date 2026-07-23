# STATUS

Last updated: 2026-07-22

## Read this first

This is the "pick back up" file — check here before touching code. See [CLAUDE.md](CLAUDE.md) for architecture (and for how this file is meant to be maintained), and [docs/DECISIONS.md](docs/DECISIONS.md) for why past choices were made.

## What's playable

Serve the repo first — the shells use ES modules, so `file://` won't work:
`python -m http.server 8123`, then open `http://localhost:8123/`.

- **The cabinet** ([index.html](index.html)) — the front door, listing all three games. Each game links back to it.

- **Serpent Battery** ([games/serpent-battery/serpent-battery.html](games/serpent-battery/serpent-battery.html)) — playable, backed by a tested engine ([engine.js](games/serpent-battery/engine.js) / [engine.test.js](games/serpent-battery/engine.test.js), 153 tests passing). [serpent-battery-standalone.html](games/serpent-battery/serpent-battery-standalone.html) is a *generated* single-file build — never edit it directly, run `node games/serpent-battery/build.mjs`.
- **Angle Iron** ([games/angle-iron/angle-iron.html](games/angle-iron/angle-iron.html)) — playable and complete: paddle-angle steering, armoured back rows, four rotating level patterns, lives, level-clear bonus. Engine has 29 passing tests. Verified end to end in a browser (play, ball loss, game over, restart, level advance).
- **Live Wire** ([games/live-wire/live-wire.html](games/live-wire/live-wire.html)) — playable and complete: buffered turning, deferred growth, expiring gold bonus, speed ramp, board-full win. Arrows/WASD plus swipe. Engine has 34 passing tests. Verified in a browser (steering, reversal blocking, eating, wall death, banner, restart, bonus render).

**228 engine tests pass across all three games** (`node --test games/*/engine.test.js`), plus 2 render smoke tests (`node --test games/serpent-battery/render-test.mjs`, after `npm install --no-save jsdom canvas`).

## In progress / just decided

- Built Live Wire under `games/live-wire/` — first grid/tick game, and the one that showed the engine/shell *seam* is legitimately per-game (Live Wire's engine owns its tick clock; Angle Iron's takes no input at all). The pure-logic principle is what's shared, not the `step` signature.
- Built Angle Iron fresh under `games/angle-iron/` on the engine/shell split — second game in the layout, and confirmation the pattern works for something other than Serpent Battery.
- Scrapped the old `arcade_games.html` (monolithic five-game cabinet). It was pulled from a larger personal site — depended on missing nav/theme chrome (`index.html`, `tracker.html`, `shared/theme.css`) and a live high-score backend (secret `SCRIPT_URL`/`API_TOKEN`) we don't have — and used the one-big-file structure we've decided against. See [docs/DECISIONS.md](docs/DECISIONS.md).
- **`shared/` extracted** — `theme.css`, `fit.js`, `fx.js`, with all three shells rewired and verified in a browser. Two things were deliberately left unshared (banner logic, engine `step()` signatures) — see shared/README.md.
- **The PWA layer is in** — `manifest.webmanifest`, `sw.js`, `shared/pwa.js`, and a generated icon set. Verified offline by stopping the server: pages load, fonts render, games play, and an uncached URL falls back to the cabinet.
- **The cabinet exists** — `index.html` ties the three games together, so this is an app rather than three loose pages. Plain links, no router, no framework.
- **Portrait layouts** added to Angle Iron and Live Wire, so all three games are phone-shaped. Verified at a 375x812 viewport: Angle Iron uses 88% of viewport height, Live Wire 83%, and a drag in Angle Iron's thumb band steers the paddle without covering the court.
- **Fonts are self-hosted** from `shared/fonts/`; nothing loads from the Google Fonts CDN any more, which was the last thing standing between the games and working offline.
- **Serpent Battery's missing `build.mjs` now exists**, so the standalone single-file build is generated rather than hand-synced. This was forced by the extraction: the standalone has to inline the shared files too, and `render-test.mjs` tests the standalone — a stale one meant the render test was silently checking old code. Regenerate with `node games/serpent-battery/build.mjs`.
- Fixed a pre-existing Windows bug in `render-test.mjs` (it used `URL.pathname`, which yields `/C:/...` with percent-encoded spaces). The render test had evidently never run on this machine; it passes now.
- Long-term stretch goal: ship as a phone app. Plan is PWA first (installable, offline, cheap, no rewrite needed); native wrapping (e.g. Capacitor) only if app-store distribution becomes a real need later.

## Immediate next step

**The road to a shippable phone app, in agreed order** (see DECISIONS.md for why this sequence):

1. ~~**Extract `shared/`**~~ — **done.** `shared/theme.css`, `shared/fit.js`, `shared/fx.js`, all three shells rewired. See [shared/README.md](shared/README.md).
2. ~~**Self-host the fonts**~~ — **done.** `shared/fonts/` holds Chivo Mono (variable 300–700) and Archivo Black, latin subset, both OFL-1.1 with licenses shipped. Verified: the served games now make **zero** external requests, and the standalone makes zero subresource requests of any kind.
3. ~~**Portrait layouts for Angle Iron and Live Wire**~~ — **done.** Both have `LAYOUT_TALL`, picked at load by aspect ratio. Angle Iron gained a `FLOOR`/`THUMB` split and height-scaled ball speed; Live Wire needed neither (per-cell pacing). Safe-area insets added to `shared/theme.css`. All three games now handle portrait.
4. ~~**The cabinet**~~ — **done.** `index.html` at the repo root lists the three games; each game header has a `← Arcade` link back. The standalone build strips that link, since it travels alone.
5. ~~**PWA manifest + service worker**~~ — **done.** Installable, and verified genuinely offline: with the server stopped, every page still loads, renders with the right fonts, and plays.

**All five steps are complete. The PWA is finished.** What remains before a store submission is game depth, not plumbing — see the store section below.

Do **not** try to unify the engine `step()` signatures — those differ per game on purpose (see DECISIONS.md).

## Store readiness (decided: targeting both stores)

Neither store takes a PWA directly — both need a native binary, so a wrapper (Bubblewrap/TWA or Capacitor for Play, Capacitor for Apple) comes eventually. $99/yr plus a Mac for Apple, $25 once for Google.

**Apple Guideline 4.2 (minimum functionality) is the binding constraint.** Three simple arcade games with no scores, audio, or progression is the profile Apple rejects. Google Play would accept this today. So the items below are *entry requirements for Apple*, not polish:

- [ ] Score persistence (localStorage — no backend, no privacy surface)
- [ ] Audio, at least hit/death blips
- [ ] More depth: powerups, more games, or progression
- [x] Real-device testing — done once, on a phone via GitHub Pages. Findings acted on (see below); worth repeating after every batch of feel changes.

**Guard this:** no tracking, no ads, no accounts, no network calls. That keeps Apple's privacy label "Data Not Collected" and Play's Data Safety form near-empty, which is where most submission pain lives. Adding an analytics or ads SDK imports that whole compliance surface.

## Hosting

Deployed to GitHub Pages at **https://tiberiousdoom.github.io/Arcade/** — from the `main` branch, root directory. Pushing to `main` redeploys; there is no build step.

Pages serves project sites from a **subpath** (`/Arcade/`, not a domain root), which is why every path in the app is relative — `start_url`/`scope` of `./`, relative precache entries, and a worker URL resolved from `import.meta.url`. This was verified by serving a copy under `/Arcade/` locally and confirming the worker registers at the right scope and the app still runs with the server stopped. **An absolute path anywhere would break the deployment**, so keep them relative.

`.nojekyll` is present so Pages serves files verbatim instead of running them through Jekyll.

## Device feedback, round one (acted on)

From a real phone, via the Pages deploy:

- Rotating kept the *portrait* board and shrank it to 19% of screen width — layout was picked once at load and never re-picked. **Fixed**, and rotation now hands the game over to the other board while keeping your progress.
- Angle Iron's portrait thumb rest sat too shallow → deepened (190 → 250).
- In landscape a thumb covered the paddle, with dead space either side → the side gutters are now live control surface (drag there to steer; tap the board to jump the paddle).
- Serpent Battery's portrait board was nearly square (880x800) and wasted a third of the screen → now 600x1150 with ten rows.
- Trim buttons ate scarce screen for little gain → removed.
- Live Wire's swipe threshold swallowed deliberate flicks (24px → 10px).
- Serpent Battery's aim needed ~500px of drag to cross its arc, more than a phone is wide → gain roughly doubled, now ~245px.
- Instructions overflowed the banner and were written for mouse and keyboard → moved behind a `?` button per game, rewritten for tap and swipe.

## Open decisions (not yet settled)

- Portrait is now device-tested and tuned. **Landscape is not** — the wide layouts, the gutter thumb rests and the rotation handover were built after that session and have only been checked in an emulator.
- No score persistence anywhere. `localStorage` is the obvious cheap answer for a phone app; the old scrapped cabinet used a remote backend, which we're not restoring.
- No audio in any game. Fine to defer, but phone arcade games usually want at least hit/death blips.
- Angle Iron has no powerups (the classic multiball/wide-paddle/laser set). The engine's `w.balls` array was built as an array specifically to leave that door open.
- No render smoke test for Angle Iron or Live Wire, unlike Serpent Battery. Now more tractable: `build.mjs` shows how to inline a module shell for jsdom, so the same approach would work for the other two. Relevant because headless-browser rAF throttling (~0.1fps) makes visual verification unreliable — a jsdom render test is the more dependable safety net.
- The cabinet is a plain list of links. No score display, no "continue where you left off", no per-game high scores — all of which want the score persistence above to exist first.

## How to update this file

At the end of a session: update "What's playable," move finished items out of "In progress," update "Immediate next step," and log any real decision in [docs/DECISIONS.md](docs/DECISIONS.md) — a one-line mention here is enough, put the actual reasoning there.
