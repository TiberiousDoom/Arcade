# Decisions

Append-only log of choices worth remembering, and *why*. Newest at the bottom. Keep entries short — a sentence or two of reasoning is enough for future us to avoid re-litigating this cold. See [STATUS.md](../STATUS.md) for current state and [CLAUDE.md](../CLAUDE.md) for architecture.

> **Note on names.** Two games were renamed on 2026-07-22 (see the entry at the
> bottom): **Breakout → Angle Iron**, **Snake → Live Wire**. Entries written
> before then use the old names; they're left as written, because rewriting an
> append-only log would misrepresent what was actually decided at the time.

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

## 2026-07-22 — Portrait layouts for Breakout and Snake

Both games gained a `LAYOUT_TALL` alongside their landscape `LAYOUT`, selected once at load with `matchMedia('(max-aspect-ratio: 4/5)')` — the same mechanism Serpent Battery already used. Selection happens at load rather than on rotation because rebuilding the board mid-run would yank it out from under the player.

**Breakout needed a floor/canvas split.** A `THUMB` band was added below the paddle, so `FLOOR = H - THUMB` is now the line a ball dies past, rather than the bottom of the canvas. The band is a thumb rest: the paddle tracks only the *horizontal* position of a finger, so resting one below the floor steers perfectly well without a hand covering the court. Verified by dragging in the band and watching the paddle follow. In landscape `THUMB` is 0, so `FLOOR === H` and nothing about the original board moved — there's a regression test pinning `PADDLE_Y` at 554.

**Ball speed is now scaled by playable height** (`levelSpeed(level, L)` multiplies by `L.FLOOR / REF_FLOOR`). Absolute px/s would have made the taller portrait board play noticeably slower and easier — the exact problem Serpent Battery solved by deriving wave speed from path length. A test asserts traversal time is identical on both layouts.

**Snake needed neither.** Its tick rate is seconds *per cell*, so reaction time per move — the whole difficulty curve — is already board-independent; a test asserts both layouts tick at the same rate. It gets no thumb band either, because steering is a flick rather than a hold, so a finger is never parked over the board.

**Aspect ratios are deliberate compromises**, not matched to a specific handset: Breakout is 1:2 and Snake ~0.53, against a modern phone's ~0.46. Matching 19.5:9 exactly would letterbox badly on a tablet or an older 16:9 device. At a 375×812 viewport these use 88% and 83% of the height respectively. The first attempt (600×900, 0.67) wasted about 230px of vertical space, which is what prompted the retune.

Safe-area insets (`env(safe-area-inset-*)`) were added to `shared/theme.css`, since neither newer game had any and the losing edge of a board should not sit under a home indicator.

**Caveat worth remembering:** all of this was tuned arithmetically and checked in an emulated viewport. Whether the boards feel right in an actual hand is untested.

## 2026-07-22 — The cabinet is plain links, not a router

`index.html` at the repo root lists the three games as cards. Deliberately a set of ordinary `<a href>` links to separate pages rather than a single-page app that swaps games in and out of one canvas.

Reasons: each game already owns its own board size, layout selection, and input wiring, so hosting them in one page would mean tearing all of that apart and rebuilding it as a lifecycle. Separate pages also mean a crash in one game cannot take the cabinet down with it, and the browser's own back button does the navigation work for free. The old scrapped `arcade_games.html` was the single-page version of this idea, and its `startGame(type)` switch is exactly the shape we moved away from.

Each game header gained a `← Arcade` link. `build.mjs` strips it when generating the standalone, because that file is meant to travel on its own where `../../index.html` resolves to nothing.

The cards carry no scores or "continue" state — that needs score persistence, which does not exist yet.

## 2026-07-22 — Targeting both app stores, which makes Apple's 4.2 bar a design constraint

Decided to aim for the App Store *and* Google Play eventually, not just a PWA. Consequences worth writing down, because they change what "finished" means:

Neither store accepts a PWA directly — both want a native binary (a signed `.ipa`, an `.aab`). So a wrapper is required eventually: Bubblewrap/TWA or Capacitor for Play, Capacitor for Apple. Costs are $99/year plus a Mac for Apple, $25 once for Google.

**Apple Guideline 4.2 (minimum functionality) is the real risk.** Apple rejects apps it considers thin or not offering a lasting experience, and simple arcade games are squarely in that zone. This reframes several items previously filed as "polish" — score persistence, audio, more games, progression — as *entry requirements* rather than nice-to-haves. Google Play is much more permissive here; if Apple were dropped, most of that pressure would go with it.

What the project already gets right, and should keep: no tracking, no ads, no accounts, no network calls at all. That makes Apple's privacy nutrition label "Data Not Collected" and Play's Data Safety form nearly empty, which is where most submission pain usually lives. No third-party SDKs to disclose. Keep it that way — adding an analytics or ads SDK later would import a whole compliance surface we currently don't have.

## 2026-07-22 — Renamed Breakout → Angle Iron, Snake → Live Wire

Renamed both games everywhere — directories, files, titles, and the `w.snake` data structure (now `w.wire`) — rather than keeping internal names that differ from published ones.

The reason is trademark exposure on store listings: "Breakout" is an Atari mark and "Snake" carries Nokia history. Gameplay itself isn't copyrightable and these are original implementations, but a *store listing name* is exactly where a complaint would land. Doing it now, with three games and no listing, costs an afternoon; doing it after publishing means migrating a live listing.

The new names follow Serpent Battery's industrial/electrical register. **Angle Iron** is a real structural steel section and names the actual mechanic — the paddle sets the ball's angle. **Live Wire** fits the electrical theme and describes what the game is: a lengthening wire that kills you.

Serpent Battery's own use of "snake" was left alone throughout — its enemies genuinely are serpents crawling a path, which is its own theme rather than a reference to the other game.

## 2026-07-22 — PWA: cache-first, with a manual version bump as the known cost

The service worker precaches the entire app and serves **cache-first**, never revalidating. The alternative — stale-while-revalidate — would remove the need to bump `CACHE_VERSION` by hand, but it serves one stale run after every update. For a game that is a worse trade than a documented manual step, so cache-first won and the footgun is called out loudly in `sw.js`, `CLAUDE.md`, and here: **change a cached file, bump the version, and add new files to `PRECACHE`.**

`skipWaiting()` + `clients.claim()` are on, so an update lands on the next reload rather than whenever every tab closes. Safe here because assets are read at page load and each page is self-contained.

Everything is path-relative — `start_url`/`scope` of `./`, precache entries of `./…`, and a worker URL resolved from `import.meta.url` rather than a hardcoded `/sw.js`. That keeps the app working when served from a subpath such as a GitHub Pages project site, which an absolute path would break.

The standalone build is deliberately excluded from the cache (it carries its own inlined copy of everything, so caching it would add ~136 KB for a file the app never navigates to), and `build.mjs` now strips the manifest link, icons, and worker registration from it, since a registration failure would log a warning on every load of a file meant to travel alone.

Icons are generated by `tools/make-icons.mjs` using node-canvas — the same dependency the render test already needs. A script rather than hand-drawn files keeps the mark consistent across five sizes and makes a new size a one-line change. The maskable variant uses a smaller scale so the art survives launcher cropping.

The PWA head tags are duplicated across four HTML files rather than injected by JS: iOS reads them at parse time and JS injection is unreliable, and there is no build step to template them. Explicit duplication beat a clever fix.

## 2026-07-22 — Rotation hands the game over instead of restarting it

Real-device testing found the layout was chosen once at load and never re-picked, so turning the phone kept the portrait board and shrank it to 19% of the screen width. The obvious fix — rebuild the board on rotation — costs the player their progress, so each engine grew a `relayout(w, L2)` that migrates state instead. How faithful that can be is a property of each game, and the difference is worth knowing:

**Angle Iron is lossless**, but only because both layouts were changed to share one brick grid (8 rows by 9 columns, differing only in pixel geometry). Damage then maps index-for-index. That is a small design constraint accepted deliberately to buy lossless rotation.

**Serpent Battery is essentially lossless**: chains are positioned by arc-length along a path, so scaling `s` by the ratio of path lengths puts every segment at the same fraction of its journey. Only in-flight shots and falling pickups are dropped.

**Live Wire cannot be lossless, and the code says so.** The grid genuinely changes shape (32x24 versus 18x34), so a wire spanning thirty columns has nowhere to exist on an eighteen-wide board. Score, meals and *length* survive; the wire is re-laid at that length, wrapping across rows if need be. Pretending otherwise would have meant either a fake mapping or blocking rotation.

No confirmation prompt was needed in the end: because progress survives, rotation can simply happen.

## 2026-07-22 — Instructions moved behind a "?" button, in touch language

Instructions lived in the opening banner, where on a phone they ran off the bottom of the screen — the player never saw them — and they were written for mouse and keyboard on what is meant to be a phone app. They now sit behind a `?` in the corner of the board (`shared/help.js`), which means they can be longer and more useful while costing no space until asked for. Serpent Battery's segment legend moved in there too, for the same reason.

The banner is now one short line: "Slide to steer, tap to serve."

## 2026-07-22 — The service worker makes local iteration confusing

Worth writing down because it cost time twice in one session: with cache-first and `skipWaiting`, a served page keeps coming back stale while you edit, and the symptom looks like "my change did nothing". While iterating locally, clear it:

    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
    caches.keys().then(ks => ks.forEach(k => caches.delete(k)));

Then reload. This is the cost of the cache-first decision, not a defect, but it is worth knowing before debugging a change that has in fact already landed.
