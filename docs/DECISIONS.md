# Decisions

Append-only log of choices worth remembering, and *why*. Newest at the bottom. Keep entries short — a sentence or two of reasoning is enough for future us to avoid re-litigating this cold. See [STATUS.md](../STATUS.md) for current state and [CLAUDE.md](../CLAUDE.md) for architecture.

## 2026-07-22 — Phone app path: PWA first, native later

Stretch goal is a phone app. Decided to target a PWA (manifest + service worker on top of the existing canvas games) rather than starting with React Native or a game engine, since the games are already touch-first and plain JS/canvas ports to a PWA with no rewrite. Revisit native wrapping (e.g. Capacitor) only if app-store distribution becomes a real requirement — Capacitor can wrap the same HTML/JS later without redoing the games.

## 2026-07-22 — Per-game engine/shell split, not one big file

New games follow Serpent Battery's pattern: a pure-logic `engine.js` (no DOM/canvas/timers) plus a thin rendering/input shell. Rejected `arcade_games.html`'s monolithic per-game-class-in-one-file approach — it's faster to prototype but isn't unit-testable the way Serpent Battery's engine is, and it already accumulated broken references (missing `shared/` files) that nothing caught because nothing tested it.

## 2026-07-22 — Real `shared/` directory, populated from actual games

Cross-game code (input handling, canvas fit-to-screen, theme, cabinet/menu shell) lives in `shared/`, but it starts empty and gets filled in as patterns emerge from real games — not designed speculatively up front. `arcade_games.html` referenced a `shared/` folder that was never built; that's the failure mode this is meant to avoid.

## 2026-07-22 — Serpent Battery migrated into `games/` first

Migrated Serpent Battery's five files into `games/serpent-battery/` as-is (no renaming) before starting any new game, so the `games/<name>/` pattern has one real, working example to point to rather than being purely aspirational. `arcade_games.html` was left at the root for now — migrating it means deciding its fate first (fix vs. rebuild vs. scrap), which is still open.

## 2026-07-22 — Documentation for long gaps between sessions

This is a solo + AI side project with potentially weeks or months between sessions. Adopted three docs: `STATUS.md` (current state, always kept fresh, read first each session), `docs/DECISIONS.md` (this file — why, not what), and `CLAUDE.md` kept to stable architecture facts only so it doesn't need touching often. No `CONTRIBUTING.md` — that convention is for external-contributor PR guidelines, which don't apply here; the "keep these docs current" rule lives in `CLAUDE.md` instead, since that file is already read every session.

## 2026-07-22 — Scrapped `arcade_games.html`, will rebuild its games fresh

Deleted the monolithic five-game cabinet rather than fixing it in place. On closer inspection it wasn't just missing a few helper files: it was carved out of a larger personal site (nav links to `index.html`/`tracker.html`, a shared `theme.css`) and its high-score feature posted to a live backend via a secret `SCRIPT_URL`/`API_TOKEN` we don't have and can't reconstruct. Resurrecting all that to keep a structure we'd already rejected (one big file, not unit-testable) wasn't worth it. The five game concepts (Breakout, Missile Command, Snake, Tetris, Space Invaders) will be rebuilt from scratch under `games/<name>/` on the engine/shell pattern if/when we want them. High-score persistence is dropped for now; revisit with a fresh backend choice later if wanted.
