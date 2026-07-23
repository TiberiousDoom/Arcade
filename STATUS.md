# STATUS

Last updated: 2026-07-22

## Read this first

This is the "pick back up" file — check here before touching code. See [CLAUDE.md](CLAUDE.md) for architecture (and for how this file is meant to be maintained), and [docs/DECISIONS.md](docs/DECISIONS.md) for why past choices were made.

## What's playable

Serve the repo first — the shells use ES modules, so `file://` won't work:
`python -m http.server 8123`, then open the links below under `http://localhost:8123/`.

- **Serpent Battery** ([games/serpent-battery/serpent-battery.html](games/serpent-battery/serpent-battery.html)) — playable, backed by a tested engine ([engine.js](games/serpent-battery/engine.js) / [engine.test.js](games/serpent-battery/engine.test.js), 153 tests passing). [serpent-battery-standalone.html](games/serpent-battery/serpent-battery-standalone.html) is a *generated* single-file build — never edit it directly, run `node games/serpent-battery/build.mjs`.
- **Breakout** ([games/breakout/breakout.html](games/breakout/breakout.html)) — playable and complete: paddle-angle steering, armoured back rows, four rotating level patterns, lives, level-clear bonus. Engine has 29 passing tests. Verified end to end in a browser (play, ball loss, game over, restart, level advance).
- **Snake** ([games/snake/snake.html](games/snake/snake.html)) — playable and complete: buffered turning, deferred growth, expiring gold bonus, speed ramp, board-full win. Arrows/WASD plus swipe. Engine has 34 passing tests. Verified in a browser (steering, reversal blocking, eating, wall death, banner, restart, bonus render).

**216 engine tests pass across all three games** (`node --test games/*/engine.test.js`), plus 2 render smoke tests (`node --test games/serpent-battery/render-test.mjs`, after `npm install --no-save jsdom canvas`).

## In progress / just decided

- Built Snake under `games/snake/` — first grid/tick game, and the one that showed the engine/shell *seam* is legitimately per-game (Snake's engine owns its tick clock; Breakout's takes no input at all). The pure-logic principle is what's shared, not the `step` signature.
- Built Breakout fresh under `games/breakout/` on the engine/shell split — second game in the layout, and confirmation the pattern works for something other than Serpent Battery.
- Scrapped the old `arcade_games.html` (monolithic five-game cabinet). It was pulled from a larger personal site — depended on missing nav/theme chrome (`index.html`, `tracker.html`, `shared/theme.css`) and a live high-score backend (secret `SCRIPT_URL`/`API_TOKEN`) we don't have — and used the one-big-file structure we've decided against. See [docs/DECISIONS.md](docs/DECISIONS.md).
- **`shared/` extracted** — `theme.css`, `fit.js`, `fx.js`, with all three shells rewired and verified in a browser. Two things were deliberately left unshared (banner logic, engine `step()` signatures) — see shared/README.md.
- **Serpent Battery's missing `build.mjs` now exists**, so the standalone single-file build is generated rather than hand-synced. This was forced by the extraction: the standalone has to inline the shared files too, and `render-test.mjs` tests the standalone — a stale one meant the render test was silently checking old code. Regenerate with `node games/serpent-battery/build.mjs`.
- Fixed a pre-existing Windows bug in `render-test.mjs` (it used `URL.pathname`, which yields `/C:/...` with percent-encoded spaces). The render test had evidently never run on this machine; it passes now.
- Long-term stretch goal: ship as a phone app. Plan is PWA first (installable, offline, cheap, no rewrite needed); native wrapping (e.g. Capacitor) only if app-store distribution becomes a real need later.

## Immediate next step

**The road to a shippable phone app, in agreed order** (see DECISIONS.md for why this sequence):

1. ~~**Extract `shared/`**~~ — **done.** `shared/theme.css`, `shared/fit.js`, `shared/fx.js`, all three shells rewired. See [shared/README.md](shared/README.md).
2. **Self-host the fonts** — now a one-line change in one file (`shared/theme.css` line 12), rather than four. The CDN `@import` still breaks offline, which is the whole point of a service worker.
3. **Portrait layouts for Breakout and Snake.** Serpent Battery already has one (`LAYOUT_TALL` + thumb rest, pacing held constant across board shapes); the two newer games have no portrait or safe-area handling at all. Snake is nearly free (the grid is `COLS × ROWS × CELL`); Breakout needs its ball speed scaled to board height instead of being absolute px/s. `makeFit` already re-reads its `board` object on every fit, so a game can swap layouts by mutating it in place.
4. **The cabinet** — a menu tying the games together. Right now there are three unrelated pages and no app.
5. **PWA manifest + service worker** — installable and offline.

Do **not** try to unify the engine `step()` signatures — those differ per game on purpose (see DECISIONS.md).

## Open decisions (not yet settled)

- Touch coverage is uneven: Snake has swipe, Serpent Battery has pointer-drag aiming, Breakout has none (it needs drag-to-move-paddle). Worth a consistent story alongside the portrait work.
- No score persistence anywhere. `localStorage` is the obvious cheap answer for a phone app; the old scrapped cabinet used a remote backend, which we're not restoring.
- No audio in any game. Fine to defer, but phone arcade games usually want at least hit/death blips.
- Breakout has no powerups (the classic multiball/wide-paddle/laser set). The engine's `w.balls` array was built as an array specifically to leave that door open.
- No render smoke test for Breakout or Snake, unlike Serpent Battery. Now more tractable: `build.mjs` shows how to inline a module shell for jsdom, so the same approach would work for the other two. Relevant because headless-browser rAF throttling (~0.1fps) makes visual verification unreliable — a jsdom render test is the more dependable safety net.
- Whether games get a shared "cabinet" menu shell or each stands alone — step 4 above. Breakout and Snake already share an 800×600 board, which makes a common frame easy.

## How to update this file

At the end of a session: update "What's playable," move finished items out of "In progress," update "Immediate next step," and log any real decision in [docs/DECISIONS.md](docs/DECISIONS.md) — a one-line mention here is enough, put the actual reasoning there.
