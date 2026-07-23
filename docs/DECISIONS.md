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

## 2026-07-22 — Breakout: paddle-angle steering, and input stays in the shell

Built Breakout fresh under `games/breakout/`. Two choices worth recording:

The paddle sets the ball's *angle* from where it lands (centre → straight up, edges → ~60° out), and ball speed is constant for the ball's whole life. That mapping is the entire control scheme — a plain reflection would look more "physical" but leaves the player no way to aim, which is what makes Breakout a game rather than a waiting room.

Unlike Serpent Battery's `step(w, dt, firing)`, Breakout's `step(w, dt)` takes no input at all: the shell moves the paddle via `setPaddle`/`nudgePaddle` and serves via `launch()`. Pointer and keyboard controls differ enough that folding them into the engine would drag input concerns into the pure layer. The engine/shell split is the constant; the exact seam is per-game.

Deferred deliberately: no powerups (though `w.balls` is an array so multiball won't need a rewrite), no touch controls, no standalone build, and no render smoke test. All logged as open items in STATUS.md.

## 2026-07-22 — Serve over http, not file://

The game shells import `engine.js` as an ES module, which browsers block over `file://`. Added `.claude/launch.json` (an "arcade-static" preview config running `python -m http.server 8123`) and documented the plain command in CLAUDE.md, so a future session doesn't lose ten minutes to a blank page and a CORS error. Committed rather than gitignored, since it's genuinely how the games get run. `.claude/settings.local.json` stays ignored — that one is machine-local.

## 2026-07-22 — Snake: the engine owns the tick clock, and the seam is per-game

Built Snake under `games/snake/`. Its engine owns the tick accumulator (`step` fires as many ticks as have come due, `tick` is exported for tests) because in Snake the *pace is the difficulty curve* — the board speeds up with every meal — which makes it a game rule, not a rendering concern. Breakout made the opposite call: its `step(w, dt)` takes no input at all and the shell drives the paddle.

The general lesson, worth not re-litigating: **the engine/shell seam is legitimately different per game.** Serpent Battery's `step(w, dt, firing)` takes input, Breakout's takes none, Snake's owns its own clock. What all three share is the principle — pure logic, no DOM/canvas/timers, deterministic — not a common signature. Don't try to unify them into one interface during the `shared/` extraction.

Two rules inside Snake that look like bugs but aren't, and are covered by tests: the cell a tail is vacating is legal to enter (chasing your own tail must not kill you), *except* when the snake is mid-growth and the tail stays put; and `turn()` validates against the last *queued* direction rather than the current one, so a fast up-then-left jink inside a single tick isn't wrongly rejected as a reversal.

Snake also got swipe controls — the first touch input in the repo — because a grid game makes the gesture unambiguous and Snake is simply unplayable on a phone without it.

## 2026-07-22 — Headless browser rAF throttling makes visual checks unreliable

Measured `requestAnimationFrame` running at ~0.1fps in the background/headless preview browser. Games therefore appear frozen or in extreme slow motion there, and any conclusion drawn about pacing from a screenshot is wrong. The workaround (documented in CLAUDE.md): temporarily expose `window.__world`/`window.__frame` from the shell, drive frames with hand-advanced timestamps or call engine functions directly, assert on state, then strip the hook. Worth knowing that banners fire on a false→true edge inside the frame loop, so bypassing it with direct `tick()` calls skips them. The durable fix is a jsdom render test like Serpent Battery's, which is why that's still an open item for the newer games.

## 2026-07-22 — Every game is portrait-capable, following Serpent Battery

Reviewed whether the current structure actually serves the multi-game phone-app goal. Verdict: the foundation (plain JS/canvas, no framework, pure-logic engines) is right and doesn't need revisiting — it ports to a PWA with no rewrite, and deterministic engines are exactly what you want when on-device debugging is painful.

Decided each game supports **both** orientations rather than locking landscape or going portrait-only. Serpent Battery already set this precedent deliberately: `LAYOUT_TALL` adds a thumb-rest band so the player's hand never covers the play area, and wave speed is derived from path length so pacing is identical on either board. Locking landscape would have made that work dead code and put a rotate-your-phone prompt in front of a casual pick-up-and-play app; portrait-only would have meant retuning Serpent, which plays best in landscape.

Retrofit cost is low because the layouts are already parameterized: Snake's board is `COLS × ROWS × CELL` with per-cell tick pacing, so a portrait grid is nearly a constant change; Breakout derives brick width from its column count, and its one real problem — ball speed being absolute px/s rather than relative to board height — has a proven fix in Serpent's derive-speed-from-length approach.

## 2026-07-22 — Phone-readiness gaps, and the order to close them

Three things block a shippable phone app, recorded so they aren't rediscovered later:

1. **Portrait layouts** are missing from Breakout and Snake (Serpent has them). Per the decision above.
2. **All four shells load fonts from the Google Fonts CDN**, which defeats offline PWA operation — the service worker's whole purpose. Needs self-hosted or system fonts.
3. **There is no cabinet** — three unrelated pages, no menu or shared identity, so there's no "app" yet.

Agreed order: extract `shared/` first (already overdue), fold self-hosted fonts into it, then portrait layouts for Breakout and Snake, then the cabinet, then the PWA manifest and service worker. The extraction goes first specifically so portrait gets fixed once in shared CSS instead of three times in three divergent copies.

## 2026-07-22 — `shared/` extracted: theme, fit, fx — and what was left out

With three games duplicating the same shell code, extracted `shared/theme.css` (palette, reset, header, stage, banner, buttons, footer, media queries), `shared/fit.js` (`makeFit`), and `shared/fx.js` (`makeFx` — particles plus a screen-flash value). Per-game visual variation goes through CSS custom properties (`--accent`, `--board-max`, …) so shells never redeclare shared rules.

Two things were deliberately *not* extracted despite looking like duplication:

**Banner show/hide.** Serpent Battery's variant hides a legend and two separate hint paragraphs and reuses the first `<p>`; the other two just set `innerHTML` on `#hint`. Sharing it would have meant a config-heavy wrapper around roughly six lines per game — more indirection than duplication.

**Serpent Battery's particles.** Its bits and floaters live on the world object and are stepped inside its engine, predating `shared/fx.js`. Rewiring it would have touched engine semantics for purely cosmetic gain, so it keeps its own. `shared/fx.js` documents this so the inconsistency reads as a decision rather than an oversight.

## 2026-07-22 — `build.mjs` written; the standalone is generated, not hand-synced

The extraction forced this. `serpent-battery-standalone.html` must inline everything it uses, which now includes the shared stylesheet and `shared/fit.js` — and `render-test.mjs` boots the *standalone*, so leaving it hand-synced meant the render test would silently validate stale code. Wrote the `build.mjs` that had been referenced-but-missing since the first commit.

It inlines each ES module as an IIFE returning **all** top-level names, not just exported ones, because the shell reaches for a few internals (`fireGun`, `_segId`) that were never formally exported — matching what the original generator evidently did. It throws if a JS `import` survives; that guard matches `^\s*import\s` rather than a plain substring, because CSS's legitimate `@import url(...)` tripped the naive version on the first run.

Also fixed a latent Windows bug in `render-test.mjs`: it derived its path from `new URL(...).pathname`, which on Windows produces `/C:/Users/Thulsa%20Doom/...` — a leading slash and percent-encoded spaces that `fs` rejects. The render test had apparently never been run on this machine. It passes now, which is what made it possible to verify the regenerated standalone properly.

## 2026-07-22 — Fonts self-hosted from `shared/fonts/`

Replaced the Google Fonts CDN `@import` with local `@font-face` rules and two WOFF2 files. The CDN dependency meant the games could not render correctly offline, which would have made a service worker pointless.

Choices worth recording:

**Latin subset only.** That is exactly what the CDN was already serving for this content, so nothing regressed — characters outside it (`←` `→` `◀` `▶` `✸` `◈`) fell back to a system font before and still do. Shipping the other subsets would have added weight for glyphs no game uses.

**Chivo Mono as a variable font.** One 26 KB file covers all four weights the shells ask for (300/400/600/700) instead of four static files. Archivo Black is only used at 400, so it stays static. ~45 KB total.

**Base64-embedded in the standalone build.** The inlined stylesheet lands in `games/serpent-battery/`, where a relative `./fonts/...` path resolves to nothing. Rather than rewrite the paths — which would have quietly made the "standalone" file depend on the repo around it — `build.mjs` embeds them as data URIs. The standalone now loads with **zero** subresource requests, which is the first time it has genuinely lived up to its name. It costs ~63 KB (72 KB → 136 KB), a fair trade for actual portability.

Both families are SIL Open Font License 1.1, which expressly permits self-hosting; the full license text ships alongside the files as the OFL requires, and provenance is documented in `shared/fonts/README.md`.
