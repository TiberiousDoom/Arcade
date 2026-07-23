# STATUS

Last updated: 2026-07-22

## Read this first

This is the "pick back up" file — check here before touching code. See [CLAUDE.md](CLAUDE.md) for architecture (and for how this file is meant to be maintained), and [docs/DECISIONS.md](docs/DECISIONS.md) for why past choices were made.

## What's playable

- **Serpent Battery** ([games/serpent-battery/serpent-battery.html](games/serpent-battery/serpent-battery.html)) — playable, backed by a tested engine ([engine.js](games/serpent-battery/engine.js) / [engine.test.js](games/serpent-battery/engine.test.js), 153 tests passing). [serpent-battery-standalone.html](games/serpent-battery/serpent-battery-standalone.html) is a hand-synced single-file build; keep it updated by hand until `build.mjs` is restored (see CLAUDE.md). Lives in `games/serpent-battery/` — first and only game in the new layout so far.

## In progress / just decided

- Scrapped the old `arcade_games.html` (monolithic five-game cabinet). It was pulled from a larger personal site — depended on missing nav/theme chrome (`index.html`, `tracker.html`, `shared/theme.css`) and a live high-score backend (secret `SCRIPT_URL`/`API_TOKEN`) we don't have — and used the one-big-file structure we've decided against. Rebuilding its games (Breakout, Missile Command, Snake, Tetris, Space Invaders) fresh under `games/` is on the table for later. See [docs/DECISIONS.md](docs/DECISIONS.md).
- `shared/` is still empty — nothing has needed it yet with only one game present.
- Long-term stretch goal: ship as a phone app. Plan is PWA first (installable, offline, cheap, no rewrite needed); native wrapping (e.g. Capacitor) only if app-store distribution becomes a real need later.

## Immediate next step

Pick the next game to build under `games/` (a fresh Breakout/Snake/etc. from the scrapped set, or something new) and let `shared/` helpers (input handling, canvas fit, theme, cabinet shell) emerge from that real code rather than being speculatively designed.

## Open decisions (not yet settled)

- PWA manifest/service worker: not started. Cheap to add early, but not urgent until there's more than one game to wrap.
- Whether the rebuilt arcade games get a shared "cabinet" menu shell (like the old file had) or each just stands alone like Serpent Battery — decide when a second game exists.

## How to update this file

At the end of a session: update "What's playable," move finished items out of "In progress," update "Immediate next step," and log any real decision in [docs/DECISIONS.md](docs/DECISIONS.md) — a one-line mention here is enough, put the actual reasoning there.
