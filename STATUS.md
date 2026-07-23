# STATUS

Last updated: 2026-07-22

## Read this first

This is the "pick back up" file — check here before touching code. See [CLAUDE.md](CLAUDE.md) for architecture (and for how this file is meant to be maintained), and [docs/DECISIONS.md](docs/DECISIONS.md) for why past choices were made.

## What's playable

- **Serpent Battery** ([games/serpent-battery/serpent-battery.html](games/serpent-battery/serpent-battery.html)) — playable, backed by a tested engine ([engine.js](games/serpent-battery/engine.js) / [engine.test.js](games/serpent-battery/engine.test.js), 153 tests passing). [serpent-battery-standalone.html](games/serpent-battery/serpent-battery-standalone.html) is a hand-synced single-file build; keep it updated by hand until `build.mjs` is restored (see CLAUDE.md). Just migrated into `games/serpent-battery/` — first game in the new layout.
- **Arcade cabinet** ([arcade_games.html](arcade_games.html), still at repo root) — **not currently runnable.** It references `shared/theme.css`, `shared/config.js`, `shared/utils.js`, and `index.html`, none of which exist in this repo.

## In progress / just decided

- Serpent Battery has been migrated into `games/serpent-battery/` (engine + shell files moved as-is, no renaming; all tests re-verified passing from the new location).
- `shared/` is still empty — nothing has needed it yet with only one game migrated.
- Long-term stretch goal: ship as a phone app. Plan is PWA first (installable, offline, cheap, no rewrite needed); native wrapping (e.g. Capacitor) only if app-store distribution becomes a real need later.

## Immediate next step

Decide what to do with `arcade_games.html`'s five games (see open decision below), or start a new game directly in `games/` and let `shared/` helpers (input handling, canvas fit, theme, cabinet shell) emerge from real code rather than being speculatively designed.

## Open decisions (not yet settled)

- What happens to `arcade_games.html`: fix its missing `shared/` dependencies as-is, rebuild those five games on the `games/<name>/` pattern, or scrap it and start fresh?
- PWA manifest/service worker: not started. Cheap to add early, but not urgent until there's more than one game to wrap.

## How to update this file

At the end of a session: update "What's playable," move finished items out of "In progress," update "Immediate next step," and log any real decision in [docs/DECISIONS.md](docs/DECISIONS.md) — a one-line mention here is enough, put the actual reasoning there.
