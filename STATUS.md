# STATUS

Last updated: 2026-07-22

## Read this first

This is the "pick back up" file — check here before touching code. See [CLAUDE.md](CLAUDE.md) for architecture (and for how this file is meant to be maintained), and [docs/DECISIONS.md](docs/DECISIONS.md) for why past choices were made.

## What's playable

Serve the repo first — the shells use ES modules, so `file://` won't work:
`python -m http.server 8123`, then open the links below under `http://localhost:8123/`.

- **Serpent Battery** ([games/serpent-battery/serpent-battery.html](games/serpent-battery/serpent-battery.html)) — playable, backed by a tested engine ([engine.js](games/serpent-battery/engine.js) / [engine.test.js](games/serpent-battery/engine.test.js), 153 tests passing). [serpent-battery-standalone.html](games/serpent-battery/serpent-battery-standalone.html) is a hand-synced single-file build; keep it updated by hand until `build.mjs` is restored (see CLAUDE.md).
- **Breakout** ([games/breakout/breakout.html](games/breakout/breakout.html)) — playable and complete: paddle-angle steering, armoured back rows, four rotating level patterns, lives, level-clear bonus. Engine has 29 passing tests. Verified end to end in a browser (play, ball loss, game over, restart, level advance).

## In progress / just decided

- Built Breakout fresh under `games/breakout/` on the engine/shell split — second game in the layout, and confirmation the pattern works for something other than Serpent Battery.
- Scrapped the old `arcade_games.html` (monolithic five-game cabinet). It was pulled from a larger personal site — depended on missing nav/theme chrome (`index.html`, `tracker.html`, `shared/theme.css`) and a live high-score backend (secret `SCRIPT_URL`/`API_TOKEN`) we don't have — and used the one-big-file structure we've decided against. See [docs/DECISIONS.md](docs/DECISIONS.md).
- `shared/` is still empty, but the two shells now visibly duplicate the fit-to-screen routine, particle lists, and header/banner CSS. That's the obvious first extraction — waiting on a third game to justify it.
- Long-term stretch goal: ship as a phone app. Plan is PWA first (installable, offline, cheap, no rewrite needed); native wrapping (e.g. Capacitor) only if app-store distribution becomes a real need later.

## Immediate next step

Either build a third game (Snake and Tetris are the natural next picks from the scrapped set — both are grid/tick-based, so they'll stress the engine/shell split differently than the two continuous-physics games do), or stop and extract `shared/` from the duplication Breakout just exposed.

## Open decisions (not yet settled)

- Breakout has no touch controls yet — it's mouse/keyboard only. Matters for the phone-app goal; Serpent Battery's pointer-drag approach is the reference.
- Breakout has no powerups (the classic multiball/wide-paddle/laser set). The engine's `w.balls` array was built as an array specifically to leave that door open.
- No standalone build or render smoke test for Breakout, unlike Serpent Battery. Worth porting `render-test.mjs` if draw-path crashes start slipping through.
- PWA manifest/service worker: not started. Cheap to add early, but not urgent until there's a cabinet/menu tying the games together.
- Whether games get a shared "cabinet" menu shell or each stands alone — decide alongside the `shared/` extraction.

## How to update this file

At the end of a session: update "What's playable," move finished items out of "In progress," update "Immediate next step," and log any real decision in [docs/DECISIONS.md](docs/DECISIONS.md) — a one-line mention here is enough, put the actual reasoning there.
