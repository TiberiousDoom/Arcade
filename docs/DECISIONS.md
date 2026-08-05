# Decisions

Append-only log of choices worth remembering, and *why*. Newest at the bottom. Keep entries short — a sentence or two of reasoning is enough for future us to avoid re-litigating this cold. See [STATUS.md](../STATUS.md) for current state and [CLAUDE.md](../CLAUDE.md) for architecture.

> **Note on names.** The games have been renamed three times. Entries always
> use the name that was current when they were written, and are never
> rewritten — this is an append-only log of what was decided *at the time*,
> and back-dating names would make past entries claim things that were not
> true when written.
>
> **2026-07-22:** Breakout → Angle Iron, Snake → Live Wire.
>
> **2026-07-30:** all four renamed to fit the shared setting.
>
> **2026-08-02:** Drift Net → Feedline.
>
> | originally | then | then | now |
> |---|---|---|---|
> | Snake | Live Wire | Drift Net | **Feedline** |
> | — | Serpent Battery | — | **Flak Battery** |
> | — | Circuit Breaker | — | **Choke Point** |
> | Breakout | Angle Iron | — | **Hull Breach** |

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


## 2026-07-22 — Live Wire's grids are exact transposes, so rotation is lossless

The first attempt at rotation rebuilt the wire from its length alone, because the two grids were arbitrary sizes (32x24 and 18x34) and no honest cell mapping existed. On a real phone that read as losing your place, which it was.

The fix was to change the shape of the problem rather than the mapping: the grids are now exact transposes (32x18 and 18x32), so rotating maps every cell (x, y) to (y, x). The wire keeps its precise shape, direction, food and bonus. It is also the least surprising behaviour available — the player physically turned the board, and the board turned.

Worth remembering as a general move: when a migration between two states is lossy, check whether the two states can be made mirror images instead of writing a cleverer migration. The same trick had already fixed Angle Iron (shared brick grid) and then fixed Serpent Battery's reversing map (matched row counts).

## 2026-07-22 — Serpent Battery's row count must match across layouts

Real-device report: "its map reverses on rotate". Cause: portrait had ten rows to landscape's seven. The path serpentines — even rows run left-to-right, odd rows right-to-left — so with different row counts, a segment at the same fraction of the path lands in a row running the opposite way, and the board visibly flips. Row counts now match; portrait spends its extra height on wider row spacing instead. There is a test asserting a segment sits the same way round at matching fractions of either path.

## 2026-07-22 — Rotation pauses the game

Even with progress preserved, being dropped straight back into a live game on a board that just changed shape is disorienting. All three games now pause on rotate and show a "Turned / Resume" banner. Serpent Battery needed a `paused` flag for this: its Begin handler resets the run whenever `!running`, which would have wiped the very progress rotation was preserving.

## 2026-07-22 — The service worker was precaching stale files

Found while chasing what looked like a caching annoyance and turned out to be a genuine defect: `cache.addAll(PRECACHE)` fetches through the browser's **HTTP cache**, so a stale copy sitting there gets faithfully precached and then served forever. Bumping `CACHE_VERSION` would have re-cached the *old* build — quietly defeating the one mechanism the whole update story depends on. Fixed with `new Request(url, { cache: 'reload' })`, which forces a network fetch.

Also added a `?nosw` escape hatch to `shared/pwa.js`: loading any page with it unregisters the worker and drops its caches. Cache-first intercepts even a forced reload, so without this, editing a file and reloading keeps showing the old page and the symptom looks like "my change did nothing".


## 2026-07-22 — Scores are local-only, on purpose

`shared/scores.js` keeps one personal best per game in localStorage under `arcade:best:<game>`. No account, no server, no device identifier, nothing to sync.

That is a store decision as much as a technical one. The current privacy posture — no tracking, no ads, no accounts, no network calls — is what keeps Apple's label at "Data Not Collected" and Play's Data Safety form empty, which is where most submission pain lives. A real leaderboard means a backend, an identifier, a privacy policy and a compliance surface, and would trade away the one thing this project has for free. If a leaderboard is ever wanted, read this entry first and price it properly.

Two details worth keeping: every storage access is wrapped, because localStorage genuinely throws in Safari private browsing and under storage policies, and a high score is not worth crashing a game over — it falls back to memory for the tab. And `best()` validates what it reads rather than trusting it, since anything could be sitting under that key (another tab, an older build, devtools). Both are covered by hand-testing against corrupted values.

The key is namespaced because GitHub Pages puts every project site on one origin, where an unprefixed key like `best` would be a genuine collision risk.


## 2026-07-22 — Audio is synthesized, not sampled

`shared/audio.js` makes every sound effect from oscillators and short noise bursts through WebAudio. No `.wav`/`.mp3` files ship. This is the same reasoning as self-hosting the fonts: the app stays a fixed, small set of self-contained files that work offline, and the precache doesn't grow by hundreds of KB of samples. The trade is that the sounds are simple 8-bit-ish blips rather than rich effects — which suits these games, and can be tuned by editing numbers rather than re-recording.

Three realities the module has to handle, all in code:
- A browser won't let an AudioContext play until the user has interacted, so the context is created lazily and resumed on the first pointer/key event.
- iOS plays WebAudio through the ringer switch even in silent mode, so a visible mute toggle is not optional. It's a speaker button mirroring the "?" help button, and the choice is remembered in localStorage (`arcade:muted`).
- No AudioContext at all (old browsers, jsdom) must be a silent no-op, not a crash — every access is guarded. The render smoke test, which boots the standalone in jsdom, exercises this path.

Serpent Battery needed one small, in-pattern engine addition: `fire()` now calls `w.fx.shot?.(count)` once per volley, so the shell can sound a single blip however many barrels loosed. Optional-chained like every fx call, so worlds built without a `shot` hook (every test, older callers) are unaffected — there's a test for both the hook firing and its absence being safe. Breaches have no fx hook; the shell watches `world.lives` across the step instead.

## 2026-07-22 — Circuit Breaker: a tower-defense built by reusing two existing patterns

Added a fourth game to answer the last item on the Apple-4.2 checklist ("more depth"). Chose tower-defense specifically because it's a *different genre* from the other three — placement and economy with auto-firing towers, not reflex/aim. Decided with the user: name Circuit Breaker; classic auto-firing towers (most distinct from Serpent Battery's manual aim, and all-taps for a phone); endless escalating waves (fits `scores.js`'s personal-best model).

The build is almost entirely reuse, which is the point worth recording:

- **Enemy movement is Serpent Battery's arc-length path** (`buildPath` + `atS`): an enemy is a `dist` along a polyline, positioned by binary search on cumulative length. No new movement code, just a different route (a fixed circuit instead of a serpentine).
- **Rotation is Live Wire's transpose.** The portrait layout is the exact transpose of landscape; because cells are square the two paths have an *identical length*, so `relayout` maps towers `(c,r)→(r,c)` and every enemy's `dist` carries over untouched — lossless. This is the third game to solve rotation by making the two states mirror images rather than writing a migration (shared brick grid for Angle Iron, transposed grid for Live Wire, transposed path here). It also means no pace rescaling: a flat px/s enemy speed is already layout-independent.
- **Towers are hitscan, not projectiles.** Instant damage on the furthest-along enemy in range, with the "beam" drawn by the shell from an `fx.shot` hook. Simplest, fully deterministic, and reads as an electrical zap. Projectiles are deferred — a feel/visual upgrade, not a mechanics one.
- The shell is the fullest example of the shared-module wiring, and reuses `makeFit`'s `extra` hook (built originally for Serpent Battery's touch pad) to reserve the tower-palette controls strip.

No standalone build or render test, matching Angle Iron and Live Wire — only Serpent Battery has those.

## 2026-07-27 — Portrait-only, as a flag rather than a deletion

Device testing said landscape "doesn't look or feel quite right." The scoped plan was to cut it outright: delete `LAYOUT`, `relayout`, `pickLayout`, the rotation handover and their tests across four engines and four shells — 105 references across 13 files, including a real chunk of every `engine.test.js`.

Done instead as `const PORTRAIT_ONLY = true` beside each shell's `pickLayout()`, with everything else left intact and inert. Three reasons:

- The signal is soft. "Doesn't feel quite right" is the least specific piece of feedback in the round, and the rotation work it reverses shipped **five days earlier** (lossless transpose rotation, pause-on-turn) after its own device pass. Reversing that permanently on a vibe, in the same month, is a bad trade when the reversible version costs one line per game.
- It is not enforceable where it matters most. `manifest.webmanifest` `"orientation": "portrait"` only binds once installed as a PWA; a browser tab cannot be orientation-locked. So on the Pages URL — the way it actually gets shown to people — a sideways phone gets a letterboxed portrait board either way. Deleting the landscape layout makes that case *worse*, not better, because there's no wide board to fall back to if we ever want one.
- Deleting the tests deletes the invariants. Circuit Breaker's transpose test and Live Wire's are the things that keep the two layouts honest; they're cheap to keep and expensive to reconstruct.

The deletion stays on the table. The trigger is device time, not another opinion: play portrait-only for a stretch, and if nobody misses landscape, delete it then.

## 2026-07-27 — Serpent Battery aim: two inputs, two corrections

Reported as too hard on a phone (level 1 unclearable) and too easy with a mouse. The instinct is to retune the aim gain curve, which had already been raised once on device feedback and still wasn't right. That instinct is wrong, because one curve cannot fix two opposite problems.

The asymmetry is structural, not tuning. A mouse aims **absolutely and instantly**: the cannon snapped to `atan2` of the cursor every pointermove, so acquiring any target was free and the game reduced to clicking. A thumb aims **relatively**, through a drag, and always lags. Same difficulty curve, two very different effective skill ceilings.

So each input gets its own correction, and neither touches the drag gain:

- **Touch — `AIM_ASSIST_R` (9px).** Extra hit radius on the shot/segment test, applied only when the shell built the world with `assist: true` (set from `pointer:coarse`). Forgiveness placed where the imprecision actually is, rather than making the aim faster, which is what the previous two attempts did.
- **Mouse — `TRAVERSE_MAX` (5.6 rad/s).** The cursor now sets a *desired* angle and the frame loop swings the battery toward it at a finite rate (`slewAim`), crossing the full 2.58-rad arc in about 0.46s. This is a genuine game rule, not a nerf: a turret has traverse speed. It costs the mouse its teleport without touching touch, where a drag rarely commands more than that anyway.

Both are single exported constants specifically so the next device session has two dials to turn and nothing else. Neither was validated by play — that's the open item.

Also fixed here, unrelated to feel: Circuit Breaker towers acquired a target only inside the `cool <= 0` branch, so `tower.aim` stayed pointed at whatever they last shot for the whole cooldown. The shell guards against drawing at a dead enemy, so the visible symptom was barrels vanishing. Acquisition now runs every frame; firing is still gated on cooldown.

## 2026-07-27 — CELL is resolution, COLS/ROWS is size

Recorded because the scoped plan got this wrong and the mistake is easy to repeat. "Circuit Breaker's grid squares are too small" was filed as "raise `CELL` (currently 52)."

`CELL` cannot fix it. `makeFit` scales the whole canvas to the stage, so `CELL` only sets how many backing-buffer pixels a cell is drawn with; a cell's **physical** size on a phone is `screen width / COLS`, and raising `CELL` just makes a bigger canvas that gets scaled right back down to the same size. The only lever on apparent cell size is the column count.

So the grid went 15x10 → 12x8, with `CELL` raised to 64 alongside purely to keep the backing buffer sharp. On a 375px phone that's ~36px → ~45px cells — a real tap target. The route was redrawn inside the smaller grid, and the transpose invariant (and its tests) still hold.

This has a difficulty side effect that must not be confused with tuning: the path is now 31 cells of travel instead of 41, and there are fewer buildable cells, so towers get less time per surge and less room. Circuit Breaker was reported as "too easy," and the economy constants were deliberately left alone so the next playtest can judge the grid change on its own.

## 2026-07-27 — Angle Iron powerups: deterministic drops, and no laser

The first depth work on an existing game rather than feel work. Four drops, chosen because each one reuses machinery already present: `multi` (the `w.balls` array was built as an array for exactly this), `wide` (`paddle.w` was already separate from `L.PADDLE_W`), `slow`, and `life`.

**The drop map is pure arithmetic on `(level, row, col)`, not random.** This engine's defining constraint is that it has *no randomness at all* — level layouts come from arithmetic so level N is byte-identical every run and in every test. A random drop would have been the first seeded LCG in the file and would have broken that property for no gain. `dropFor(level, row, col)` hashes the three into a sparse, weighted table instead. The payoff is more than testability: a level's drops sit in the same places every time, so they become something a player learns rather than something that happens to them. Same reasoning as `brickPresent`.

Weighting lives in the table's repeats (`['multi','wide','slow','wide','multi','slow','wide','life']`) rather than in a branch, so changing the mix is editing data. `life` is one entry in eight of that table, and only about one brick in seven drops at all.

**`slow` bends a documented invariant, deliberately.** The engine's comment says a ball keeps its speed for its whole life, so difficulty is set entirely by `levelSpeed` rather than drifting as the ball rattles around. `slow` scales it. The property actually worth keeping is the *second* half of that sentence — speed comes from one authority and never drifts through collisions — so speed now resolves through `effectiveSpeed(w)` (`levelSpeed` × an explicit, timed, visible modifier) and bounces still preserve whatever it currently is. A test pins that `slow` changes magnitude only, never heading.

**Lifecycle decisions worth recording:** timed effects clear on life loss, `nextLevel` and `resetGame` — losing the board loses what was running on it. But they **survive a relayout**, because they were earned and a board change isn't a failure; the paddle is re-widened against the new layout's base width. Capsules in flight do *not* survive a relayout, for the same reason the ball doesn't: their position means nothing on a board of another shape.

**No laser**, though it's the fourth item in the classic set. Multiball, wide and slow are all modifiers on things that already exist. A laser is a new verb: a projectile system, a fire input, and its own collision pass against the brick field. That's a feature, not a powerup, and it would have doubled the size of this change.

The shell draws capsules as pills with a one-letter glyph (letters, not icons — they stay legible at ~22px on a phone), tints the paddle while `wide` is up so the effect is visible on the thing it changed, and puts the effect timers bottom-left just inside the floor line. Top-left was the obvious spot and was wrong: the audio toggle and help button already own both top corners, which a screenshot caught immediately.

## 2026-07-27 — Serpent Battery difficulty: what was actually missing, and why the head is armoured

The ask was "make it harder": longer serpents, more hp per segment, killing the head kills the snake, and harder segment types unlocked over time. Three of those were straightforwardly right, and the code showed why they were needed rather than merely wanted.

**Segment hp never scaled with the wave.** `KIND` hp were fixed constants and nothing multiplied them, so a wave 20 segment had exactly the health of a wave 1 segment — late waves were only longer and faster. Added `hpScale(wave)`, deliberately the same shape as Circuit Breaker's so the two games' difficulty maths read alike. Capped at ×4 so a deep run can't produce a wave whose total health simply cannot be cleared in the time it takes to cross. Two knock-on scalings that would otherwise have rotted: volatile's neighbour splash (a flat 3 against 4×-health neighbours is nothing) and the head a splitter grows.

**Wave 1 was already throwing everything at once.** `kindForIndex(i, count)` had no wave parameter, so its modular placement rules fired from the first wave — wave 1 contained armored, volatile, shielded, regen, carrier *and* a splitter. That, more than the aim curve, is why "couldn't clear level 1" was the report. `KIND_UNLOCK` now introduces one kind at a time, ordered by how much new thinking each demands rather than by raw toughness: carrier (a bonus) → armored (just tougher) → volatile (chain reactions) → shielded (forces flanking) → regen (punishes chip damage) → splitter (changes the board). Note this makes the early game *easier*, which is the correct direction for an opening.

**Killing the head kills the snake — but the body armours the head.** Taken literally the request would have made the game much easier, and it's worth recording why. The head is index 0, the **leading** segment: the closest target to the battery and the first thing to breach. So an instant-kill head would have been simultaneously the easiest shot available and a win button, collapsing every other mechanic — recoil, mid-chain cutting, splitters, shielded flanking — into irrelevance.

The fix keeps the requested payoff and inverts the incentive: `headDamageFactor(bodyLeft) = 1/(1 + bodyLeft)`, so a full-length chain leaves the head taking ~3% of normal damage. Clearing the body first is the efficient route; a rail shot or overdrive burst can still buy an early decapitation, which pays out every segment still attached. That turns the head from a shortcut into a risk/reward decision, and a decapitation now genuinely feels like a finisher.

This *had* to be made visible or it would read as a bug — shots landing on the head and doing nothing, with no stated reason. The shell draws a ring around the head whose weight tracks the protection and which flashes white when a hit is absorbed, reusing the `deflect` field the shielded plates already use. The help panel says it in one line.

A test asserts a maxed battery with perfect aim still reaches wave 20 without a breach, which is the guard against the hp cap quietly becoming a wall. (Unbounded, that same bot clears wave 46.)

Also in this pass: the shared `.meta` HUD gave every item identical weight, so mid-run the numbers were no easier to find than their labels — the value now carries the weight and the label is small and dim, for a 4px header cost. Serpent Battery's shop controls were sized for a cursor (`.buy` computed to ~28px tall, `.chip` 26px square); both are now proper thumb targets, and "can't afford" is visually distinct from "maxed" and names the shortfall instead of leaving the player to subtract.

## 2026-07-27 — One app-wide build version, not one per game

Asked whether each game should show a version number next to its name. Declined the per-game form and built the app-wide one instead.

Per-game semver would mean four numbers maintained by hand with no release process behind them; they would drift within weeks, and a player does not care that Live Wire is at 1.3.0. But the question came from a real problem, hit twice in one session: `sw.js` serves cache-first without revalidating, so a phone can keep running a stale build after a deploy with no way to tell by looking. (It bit the local verification loop repeatedly too.)

So `shared/version.js` exports one `BUILD`, surfaced in every help panel and the cabinet footer — quiet, diagnostic, and enough to answer "did my phone pick up the deploy?" in two taps. It is placed away from the game titles on purpose: it's a diagnostic, not decoration.

The one hazard is a displayed version that disagrees with the cache actually being served, which would be worse than showing nothing — a build string that confidently lies. `shared/version.test.js` reads `sw.js` and fails if `BUILD` and `CACHE_VERSION` drift, which turns a convention into a guarantee. This also adds a second test location, so the documented command is now `node --test games/*/engine.test.js shared/*.test.js`.

## 2026-07-27 — Circuit Breaker depth: routes, enemy traits, and Coil as support

Took three of the five depth ideas — the ones that add *decisions* rather than content.

**Three circuits instead of one.** A single fixed route meant every run was the same board: the game was one puzzle, solved once, and replaying only repeated it faster. `ROUTES` now holds three, and a run picks one from its seed so a seed still replays exactly (the route is part of what a seed means). `resetGame` advances to the next, so Play again is genuinely a different defence problem.

Per *run*, not per wave. Swapping the path mid-run would strand every tower off the route and invalidate the whole board a player had just built — variety is not worth that.

The invariants are more delicate than they look, so they are all pinned by test: legs must be axis-aligned because `pathCells` walks a cell at a time between waypoints and a diagonal would silently skip cells; each route must fit both grids; each must transpose cell-for-cell and come out the *same length* in portrait, which is what keeps rotation lossless; and each must leave enough buildable cells to be playable. `relayout` was rebuilding at route 0, which would have swapped the board underneath a rotating player — caught while threading the index through, and now a regression test.

The HUD names the circuit (A/B/C). Without a label, a changed board on replay reads as a bug rather than as a feature.

**Enemy traits, because "more of the best tower" was always the right answer.** Enemies differed only in hp, speed and bounty, which is a difficulty dial, not a decision. Four traits now make specific towers the *wrong* tool:

- `armor` — flat reduction per hit, so many weak shots (Node) are wasted and few heavy ones (Breaker) are right.
- `splashResist` — the mirror case, where Breaker's area damage is the wrong pick.
- `slowImmune` — Coil cannot set it up, so the synergy below is unavailable.
- `heals` — repairs neighbours, so *which* enemy you shoot starts to matter, not just total damage.

Shell's armour is 3 and not higher on purpose. At 6 it exceeded Node's base damage outright, which made Node permanently useless against Shell rather than something worth *upgrading* to make viable — the difference between "wrong tool" and "dead option". A test now pins that a maxed Node gets meaningfully through.

Patches heal other enemies only, never themselves, and one per wave — two would mend each other and stall a wave indefinitely. Healing is applied before towers fire, so a player sees their shot land and *then* sees it undone, which is legible; the reverse order would look like the shot never registered.

**Coil is now support rather than a weak gun.** Anything slowed takes ×1.4 damage from everything. The ordering carries the whole design: the bonus is read from the slow *already* on the target, so a Coil's own shot never benefits from the slow it is applying. That makes Coil a setup piece whose value is what it enables, which is a role it did not previously have — it was simply the worst damage-per-charge option.

**Deliberately not done:** projectiles and the between-waves choice. Projectiles are worth more *after* this is played, because travel time makes leading targets and placement angles matter — it multiplies traits and routes rather than standing on its own.

Readability was not optional here. When a tower stops working the player must read "wrong tool", not "broken game", so each trait gets a silhouette cue (heavy ring, dashed shell, chevron, cross) rather than colour alone, since colour is already busy naming the type. One collision was caught only by taking a screenshot: the old `slow` rendering *replaced* the fill with a blue almost identical to Shell's own colour, making "held up" and "plated" indistinguishable when the two call for opposite responses. `slow` is now a translucent frost laid over the type colour.

## 2026-07-27 — The service worker ignores query strings, which defeats cache-busting

Recorded because it cost real time and will again. `sw.js`'s fetch handler uses `caches.match(req, { ignoreSearch: true })`, so a precached path matches *regardless of query string*. Every `?v=`/`?bust=` cache-buster — on a page URL or on a module import — is silently answered from the old cache.

That is defensible for this app (nothing uses query-versioned assets, and ignoring search means a stray `?utm_source=` still hits the cache offline) but it has two consequences worth knowing:

- **Query-string versioning can never work here.** The only lever that refreshes anything is bumping `CACHE_VERSION`, which is exactly what `install` is built around with its `cache: 'reload'` fetches.
- **Local iteration needs the version bump too**, or two reloads with the worker unregistered. Unregistering alone is not enough, because `shared/pwa.js` re-registers on the next load and `activate` calls `clients.claim()`, so the fresh worker takes over and serves its cache to the page that just loaded.

Practical loop when changing a file and verifying in a browser: bump `CACHE_VERSION` and `BUILD`, then reload twice — once to install the new worker, once for the page to read from the new cache.

## 2026-07-29 — Render tests for every game, via a shared inliner

Only Serpent Battery had a draw-path test, because only it had a standalone build for jsdom to boot. The other three were verified by eye in a browser, which is unreliable: headless rAF is throttled to ~0.1fps, so "is it moving" cannot be answered honestly, and two real bugs this month were caught only because a screenshot happened to be taken.

Rather than give every game a standalone (four more checked-in artifacts to keep in sync, for games that are never distributed as single files), the inlining moved into `tools/inline.mjs` and the render tests inline **in memory**. Serpent Battery keeps its standalone because it is genuinely meant to travel alone; the others get the same safety net with nothing to go stale.

**Building this immediately paid for itself.** The old inliner listed each import by hand and deleted any it did not recognise. When `shared/help.js` gained an import of its own (`version.js`, three days earlier), that nested import was silently dropped, `BUILD_LABEL` became a free variable, and the standalone threw at boot — shipped broken in v9 and v10, with the render test failing the whole time because it had not been re-run. The new inliner resolves the import graph recursively, so a shared module gaining a dependency is no longer a trap.

Two things the harness has to fake, both worth knowing:

- **`getBoundingClientRect` returns zeros in jsdom.** Every shell converts pointer positions to board coordinates by scaling with that rect, so a zero width yields `Infinity` and every click lands nowhere. Reporting the canvas's own pixel size makes client coordinates map 1:1 onto board coordinates, which is what makes input testable at all — the Circuit Breaker popup test depends on it.
- **jsdom's default `about:blank` origin makes `localStorage` throw.** The games survive it (every access is wrapped) but scores and saved runs become untestable, so the harness boots on a real origin.

## 2026-07-29 — Mid-run saves, and the three games that should have them

"Continue where you left off" is not a feature every game should get. Live Wire is one-life score-attack: resuming a run makes its ladder meaningless, and the genre convention exists for a reason. Circuit Breaker and Serpent Battery have long runs where losing progress genuinely stings, and Angle Iron is level-based, so those three get it. Circuit Breaker is done; the other two follow the same pattern.

The split follows the house rule: **engines own what a snapshot is** (`snapshot(w)` / `hydrate(w, snap)`, pure and unit-tested), `shared/resume.js` owns only storage. That keeps the interesting logic out of the DOM.

Decisions inside that worth recording:

- **Snapshots are stamped with `BUILD` and refused on mismatch.** A snapshot is a picture of engine internals, and this project changes those constantly — `routeIndex` did not exist a day ago. Restoring across a build boundary would produce a subtly corrupt run, which is far worse than losing the save. Discarding is the safe default.
- **`hydrate` validates and refuses rather than half-applying.** A tower whose type this build no longer has would break every lookup downstream. On any bad input it changes nothing and returns false, so a corrupt save degrades to "start a new run" rather than to a broken one — the same posture `scores.js` takes toward whatever it finds under its key.
- **`tower.aim` is not stored.** It holds a live enemy *object*, and JSON cannot carry identity; a naive round-trip would produce a tower aiming at a copy that is not in `world.enemies`. It is dropped and rebuilt, which is only safe because `step` re-acquires every frame — a property that exists because of the barrel-freeze fix earlier this week. Derived state (`path`, `pathLen`, `blocked`) is likewise rebuilt from `routeIndex` rather than stored.
- **Saves are written on quiet beats**, not every frame: when a wave ends, and on `visibilitychange`. That last one is the event that actually fires when a phone backgrounds an app — `beforeunload` is unreliable on mobile. Serialising the whole board 60 times a second would buy nothing.
- **The resume prompt offers both paths.** "Continue" and "New run" are two buttons, rather than resuming silently or hiding the fresh start behind a gesture — a stale save you cannot escape is worse than no save.

## 2026-07-29 — Mid-run saves finished: Serpent Battery and Angle Iron

The pattern set by Circuit Breaker carried over unchanged — engines own `snapshot`/`hydrate`, `shared/resume.js` owns storage — but each game had one non-obvious trap.

**The `started` flag, in all three.** `saveNow` originally refused to write unless `world.running`. That is exactly backwards: the states most worth saving are the paused ones — Serpent Battery's shop is open between waves, Angle Iron sets `running = false` the moment a level clears — so the guard deleted the save at precisely the moments it should have written one. Shells now track a `started` boolean set when the player first presses Begin, and save on `!over && started`.

**Serpent Battery: segment ids outlive the counter.** `battery.lastHitAt` is keyed by segment id, and `_segId` restarts at 1 every page load. Restoring a run brings back segments carrying ids from a previous session, so a freshly spawned segment could reuse one and inherit a stranger's convergence timing — a bug that would have shown up as occasional unearned FOCUS bonuses and been almost impossible to trace. `reserveSegIds` pushes the counter past anything restored.

**Serpent Battery: `assistR` is not part of a run.** It records whether the *device* aims by touch or mouse. Storing it would let a phone save carry its 9px aim assist onto a desktop, quietly making the game easier there. Excluded from the snapshot; the live world keeps whatever its own device decided.

Also dropped: in-flight shots and decorative particles. A shot resumed mid-trajectory is meaningless, and nobody comes back to a saved game hoping their sparks survived.

**Angle Iron: saves are layout-agnostic.** Bricks are stored as damage keyed by `(row, col)` and the paddle as a fraction of board width, rather than as rectangles and pixels — the same trick `relayout` uses. A run saved on one board shape therefore restores correctly onto the other, which matters because the layout is picked at load from the device.

Live Wire remains deliberately excluded. It is one-life score-attack; a resumable run makes its ladder meaningless.

## 2026-07-29 — The vector/CRT art direction, and piloting it on Live Wire

Decided the games move to an emissive vector look — the Asteroids/Tempest idiom — rather than to hand-drawn sprites. Sprites would need an artist, an asset pipeline and a lot of files, all of which fight a project whose architecture is "no build step, works offline, self-contained". The games already have an identity (electrical theming, mono type, a distinct accent each); this cashes it in as code, adds zero asset bytes, and unifies all four at once.

`docs/crt-demo.html` (viewable on Pages) compares four techniques side by side and is what the choice was made against.

**The 3D question resolved into two answers.** A true vector display can only do wireframe — perspective projection with no surfaces to shade — which Canvas 2D does perfectly well but which is a different *game*, not a skin. What was actually wanted was volume: `extrude` draws a dark opaque body, a glowing rim, and a second face offset behind with the silhouette edges connecting them. Objects read as solid and dimensional without pretending to be rendered models.

**Canvas 2D, not WebGL**, and not for nostalgia. WebGL would make real bloom cheap, but the render tests boot every shell against node-canvas, which is 2D only — moving to WebGL would throw away the draw-path safety net across all four games, immediately after building it. Multi-pass strokes get the look anyway.

**Not `shadowBlur`**, which is the obvious API for glow and is brutally slow on a phone. Drawing the same path four times at decreasing width and increasing alpha under `globalCompositeOperation = 'lighter'` is faster and gives control over the falloff.

Piloted on **Live Wire** rather than everywhere: smallest shell, best genre fit, lowest readability risk — and, practically, the one game not on the device-test checklist, so changing it could not disturb a playtest in progress. Circuit Breaker will get the most conservative treatment when its turn comes, because its enemy trait cues depend on crisp silhouettes and bloom actively fights them.

Three things only became apparent once frames were actually rendered:

- **Static content accumulates under a phosphor fade.** Anything redrawn every frame onto a surface that is faded rather than cleared settles at about `1/fade` times its written alpha — the grid at 0.55 was arriving on screen at roughly full strength. Static alphas now compensate; the alternative (a separate un-faded layer) needs a second canvas and would have collided with the render harness, which hands every canvas element the same context.
- **A stroked circle is an annulus.** `glowDot` originally stroked a circle, so anything smaller than about twice the line width rendered as a visible donut — the food pellet had a hole in it. It now strokes a zero-length round-capped segment.
- **Extrusion is wrong on the tip of a glowing form.** It fills a dark body before rimming, which on the end of Live Wire's tube punched a hole where the head should be brightest. Extrusion is for discrete objects sitting on a dark board; the head is now a bright `glowDot`. Similarly, detail *inside* an emissive shape (the head's pupils) cannot be additive, since additive cannot darken — hence `inkDot`.

Added `tools/screenshot.mjs` alongside, which renders a real frame to a PNG via the render harness. Art work is impossible to judge otherwise from a headless environment: a background browser throttles `requestAnimationFrame` until it stops compositing entirely, so screenshots come back blank and every one of the findings above would have been invisible.

## 2026-07-30 — Glow made Live Wire's food hard to find

Device feedback on the art pilot: the wire looked right, but the food was effectively invisible — collected only by accident.

The first diagnosis was wrong and worth recording as a wrong turn. `glowDot` drew a zero-length round-capped segment, which is a known-dodgy primitive (some renderers discard degenerate segments), and Cairo — what the render tests use — draws it happily. That looked like a clean explanation for "passes every test, invisible on device". Measuring it in an actual browser disproved it: Chrome renders the degenerate segment identically to a filled arc. The primitive was swapped for stacked filled discs anyway, since that behaves the same everywhere and costs nothing, but it was not the bug.

The real cause was the falloff table. `glowDot`'s passes ran `[1.9, 1.35, 0.9, 0.5]` — the only full-alpha pass was at **half** the requested radius. A caller asking for a 7px pellet got a 3px opaque core inside a soft smudge, where the flat art it replaced had been a solid 7.5px disc. It rendered correctly and simply read as haze rather than as an object, which on a phone, next to a very bright wire, meant it disappeared.

`r` now means the solid core, with the glow spreading outside it, so a dot is at least as substantial as the flat shape it replaces and merely gains a halo. Live Wire's food additionally gets a near-white inner dot: a hot centre is what makes a small emissive object read as *present*, and it is the one thing on that board a player is actively hunting for.

The general lesson for the rest of the art pass: **glow is a poor substitute for mass.** Adding a halo while shrinking the solid core makes something prettier and harder to see, and readability regressions of this kind survive every automated check — the pixels are all there, correctly, in the wrong proportions.

## 2026-07-30 — Circuit Breaker's art pass, and the no-trails decision

Third game onto the vector look, and the one flagged from the start as needing the most conservative treatment.

**No phosphor trails here, unlike Live Wire.** A tower-defense puts many small moving objects on screen whose exact position and type have to be read at a glance; smearing them would work directly against the enemy trait cues, which exist precisely so a player can tell why a tower is underperforming. Circuit Breaker clears every frame. A useful side effect is that static alphas are literal, with none of the accumulation Live Wire has to compensate for.

**Enemies keep their solid bodies and gain a halo outside them** — the rule learned from Live Wire's food, applied pre-emptively. These are smaller than the food, there are far more of them, and they must be told apart, so the opaque disc stays exactly the size it was. The trait cues (heavy ring, dashed shell, chevron, cross) are deliberately drawn hard-edged and *unglowed*: a halo on a 3px chevron is a smudge, and distinguishing Shell from Phase from Patch is the most load-bearing readability job on that board.

**Towers are what `extrude` was built for** — discrete objects on a dark board — in contrast to Live Wire's head, where the same call punched a hole in a glowing tube. One adjustment was needed: the default body colour is near-black, which against this board made towers read as hollow rings rather than solid installations. Their body is lifted well above the board colour.

**The mistake worth recording: additive compositing cannot darken.** The path was meant to be a recessed channel with lit edges, so it was drawn as a wide additive band with a dark inner stroke laid over it — also additively. Additive of a dark colour still *adds*, so the "dark" inner brightened the channel and the path came out as a glowing ribbon dominating the board, exactly the opposite of the intent. The inner stroke is now painted with the normal composite, which leaves the additive band showing only as a fringe. This is the same trap as Live Wire's pupils, and is now called out in `shared/README.md`: anything meant to be *darker* than its surroundings cannot go through `glowStroke`.

Beams get the biggest payoff, unsurprisingly — a hitscan zap is literally a line of light. Tower colour with a white-hot core, plus a flare where it lands so a hit registers even when the target survives.

Also fixed `tools/screenshot.mjs`, which had been quietly lying: most shells clear to transparent and let the page background show through, so a raw capture carries an alpha channel that renders as white and makes a dark game look like a blown-out negative. It now paints the board colour underneath with `destination-over` — which also avoids `drawImage` rejecting a canvas from a different copy of the node-canvas module.

## 2026-07-30 — The four games are one story, and were renamed to match

The games were four unrelated toys that happened to share a look. They are now one arc: **you play the invasion first, then defend against it twice, then answer it.**

| # | now | was | you are |
|---|---|---|---|
| 1 | Drift Net | Live Wire | the invader — a connected body that grows by taking worlds |
| 2 | Flak Battery | Serpent Battery | planetary anti-air as the fleet descends |
| 3 | Choke Point | Circuit Breaker | ground defence once they have landed |
| 4 | Hull Breach | Angle Iron | the counter-attack against their hull |

**The fiction was fitted to mechanics that already existed, not the reverse**, which is the whole reason it works. Drift Net already grows and wins by covering the board. Flak Battery already faces a single descending chain. Choke Point already funnels a column along a fixed route toward a core you defend. Hull Breach was already a sphere against rectangular plates. Nothing had to be built to make the story true.

Two mechanics gained a meaning for free: killing Flak Battery's head ending the whole formation is now a command ship (and the body-armours-the-head rule reads as escorts screening it), and Choke Point's Patch healing its neighbours is a repair drone.

**Names keep the existing convention** — real compound terms that mean two things at once, as Live Wire, Angle Iron, Circuit Breaker and a *battery* of guns all did. Flak Battery is an anti-aircraft emplacement. A drift net is a long connected thing that sweeps up everything it touches. A choke point is where a small force holds a larger one. A hull breach is both the act and the result.

**The invaders are never named.** Colder, and it keeps the collection from sounding like it wants to be a franchise. The shapes carry the identity instead.

**Told in one line per game**, on the cabinet card and at the top of the help panel (`makeHelp({ lore })`). No cutscenes and no text screens: the games stay pick-up-and-play and anyone who doesn't care never reads a word of it. The cabinet also orders the cards by the story rather than by build date, and numbers them.

**Game IDs and directories were renamed too.** This was raised as a cost — `shared/scores.js` and `shared/resume.js` key off the game id, and the cabinet derives it from a CSS class, so renaming silently discards every personal best and every saved run. The owner accepted that knowingly: one player, and he did not mind. Recorded because the *next* rename may not be so cheap, and would want a migration with a fallback read of the old key.

One thing the rename nearly got wrong: each game's `<h1>` is split across a span — `<h1>Live <span>Wire</span></h1>` — so a bulk replacement of the literal string missed all four titles while changing everything else. Every page still said its old name in the largest text on screen, and every test passed. Caught by loading the games and reading the DOM rather than by trusting the replacement count.

**Deliberately deferred:** the visual half — spheres for defenders, cubes for invaders. Changing every enemy from a disc to a cube at the same moment as finding out whether the v17 trait cues read on a device would make both answers unreadable.

## 2026-07-31 — Spheres and cubes, made absolute

With the Choke Point trait cues confirmed readable on a device, the visual half of the setting landed: **invaders are cubes, defenders are spheres, everywhere, without exception.** `cube()` in `shared/glow.js` draws the former — a square face, a second face offset behind, and the silhouette corners joined, which reads as solid without needing a projection matrix.

The rule is absolute on purpose. Shape alone telling you which side something is on is what keeps a busy board readable at a glance; a "sort of rounded" middle ground would throw that away for nothing. Per game:

- **Drift Net** — you are the invader, so the body became a chain of cubes. The continuous glowing tube stays underneath, thinner, now reading as the tether that holds them into one body: without it a row of separate squares stops looking connected, which is the one thing that shape has to communicate. Body cubes are drawn cheaply (a fill plus a two-pass rim) rather than via the full `cube()` helper, for the same reason the body was a single polyline to begin with — eight stroke passes across sixty cells is several hundred draws a frame on a phone.
- **Flak Battery** — segments were elongated plates, which read as one armoured body. Square now, and only slightly long so direction of travel still reads, because the fiction is a column of individual craft.
- **Choke Point** — the risky one, since its trait cues had just been confirmed working. The cue *language* was preserved exactly (heavy = plated, dashed = insulated, chevron = unslowable, cross = repairs) and only refitted from circles to squares; the towers stay round, so the defender/invader read is immediate.
- **Hull Breach** — deliberately unchanged. Its ball was already a sphere and its bricks are hull *plating*, not craft; forcing them square would have confused armour with units. The exception that proves the rule.

Still outstanding: the glow pass for Flak Battery and Hull Breach. Both now have the right shapes but are still on flat fills, so they look out of step with the two games that have been converted.

## 2026-07-31 — Glow pass finished: Hull Breach and Flak Battery

The last two games onto the vector look, which completes the art direction across all four.

**Neither game gets phosphor trails.** Hull Breach's board is mostly static plating and Flak Battery's is a fixed path — anything static accumulates under a fade until it washes out, which Drift Net has to compensate for with deliberately-thin alphas. Hull Breach instead gives *the ball alone* a trail, tracked as recent positions in the shell, so exactly one thing smears and the plating stays crisp. That is a better pattern than a full-frame fade wherever most of the screen is stationary.

**Hull Breach's plates are not extruded**, even though they are rectangles on a dark board, which is normally exactly the `extrudeRect` case. Tiled edge to edge at this size the offset back faces overlap their neighbours and the whole field turns to mush. Extrusion needs empty space around an object to read as depth; a dense grid does not have any.

**Damage now dims the rim rather than fading the body**, in both games. A half-broken plate should look like its lights are going out, not like it is becoming transparent — and on an emissive style, fading toward the background is indistinguishable from being destroyed.

**The trap this pass sprang, again in a new form: contrast inversion.** Flak Battery's segment bodies used to be bright gradient plates, so the hp numbers, the damage cracks, the head's eye sockets and the shielded plate's rivets were all drawn *dark on top*. Making the body dark inverted every one of those, and they vanished — the numbers most visibly, since they are load-bearing information rather than decoration. Nothing failed; no test could have caught it; the pixels were all drawn exactly as instructed, in a colour now identical to what was underneath.

That is the third distinct version of the same underlying mistake this week (glow instead of mass; additive cannot darken; now dark-on-dark after a body flip). The general rule, worth stating once: **converting to an emissive style inverts the background, so every foreground colour chosen against the old background has to be re-checked.** It is not enough to convert the shapes.

## 2026-08-01 — Hull Breach's paddle upgrades are cached, not live, on purpose (by inheritance)

Adding a salvage currency and a paddle/steer/catch upgrade tree to Hull Breach (the three features deferred from the v22 pass) surfaced a property inherited from the existing `wide` powerup rather than introduced fresh: `w.paddle.w` is a field recomputed at specific transition points (`clearEffects`, the `wide` pickup, its expiry, `relayout`, `hydrate`) — never read live from `stats(w)` every frame the way Flak Battery's `fireGun` reads its own `stats(w)` fresh on every shot.

That means buying a paddle-width tier in the shop doesn't visibly widen the paddle until the next trigger point. In practice this is invisible: the shop only opens between levels, and its own "Next Level" button calls `nextLevel()` immediately after, which recomputes `paddle.w` as part of the same click. A test initially written to check the width immediately after `buyUpgrade` failed for exactly this reason, and was corrected to assert through a `nextLevel()` call — a good reminder that a passing assumption about "when does an engine field update" needs to be checked against the actual call sites, not the mental model of a *different* game's engine.

## 2026-08-01 — Ion cannon: a second axis of resistance, deliberately independent of `shielded`

Flak Battery already had one "this gun doesn't work here" mechanic (`shielded`'s frontal-arc deflection, beaten by flanking). The ask was for a second one specifically tied to a gun *type* rather than shot *angle* — a hardened hull only the ion cannon meaningfully hurts.

Built as a wholly separate code path rather than extending `shielded`: `KIND.hardened` carries `ionResist` (a flat damage multiplier), checked in `damageSeg` against a new `shot.gun` field threaded from `fireGun`. No `shield` flag, so `isDeflected` never fires for it — flanking buys nothing, which is the point. A test pins this independence explicitly (`isDeflected({kind:'hardened'}, ...)` is always false) so the two mechanics can't accidentally merge later.

**Heavily resistant, not immune** — non-ion shots still do a small fraction (12%) of normal damage. Full immunity was the more literal reading of the original note, but it produces a gun that can *literally do nothing*, which no other kind in the game does (even `armored` is just high hp, always choppable). Consistent with the project's existing damage-shaping precedent (`headDamageFactor`, `splashResist`) of "much worse, not impossible."

Shot color is otherwise driven entirely by the shared overdrive tier (`OD_TIERS`), not by gun type — every existing gun's bolts already share one color regardless of `auto`/`rail`/`mortar`. Rather than restructure that for all four gun types (out of scope, and risk for no requested benefit), only the ion cannon's shots get a type-specific override, leaving the other three untouched.

## 2026-08-01 — Hull Breach and Flak Battery: no new precache files beyond the obvious

`shared/levels.js` (Hull Breach's level-select persistence) is a new file and went into `sw.js`'s `PRECACHE` list alongside the version bump, same discipline as `shared/pause.js` the pass before. The ion cannon and hardened-kind work touched only existing files (`engine.js`, `flak-battery.html`), so no further precache changes were needed for it — worth noting explicitly since it's easy to assume "a new feature always means a new file."

## 2026-07-31 — v22 device checklist: a per-chain position cache, not a per-frame one

Flak Battery's wave-15+ chop traced to `stepShots`: every shot tested every segment of every chain, and each test called `segPos` — an O(log n) binary search over the path — fresh. With 5 guns and the spread upgrade stacking shots, that's shots × segments × log(path-length) per frame.

The first fix cached each chain's segment positions **once per `stepShots` call, shared across all shots that frame** — correct-looking, and wrong: it broke 7 tests. The bug was assuming a chain's positions are stable *within* a frame just because nothing had hit it yet. They aren't — `stepChains` moves every chain forward before `stepShots` runs, so a cache that survives from the *previous* frame (built lazily, on first access, and never invalidated except by a splice) is stale from frame two onward regardless of combat. The fix needed two invalidation triggers, not one: every chain's cache is nulled at the top of *every* `stepShots` call (movement invalidates it), and `damageSeg` nulls it again after `ch.segs.splice(...)` (a death or a splitter's split invalidates it *again*, mid-frame, since a chain can be hit more than once in one frame). Lazy rebuild-on-next-access handles both.

Worth remembering as a general shape: a cache invalidated by "the thing that obviously changes it" (a splice) can still be stale from "the thing that changes it every single frame regardless" (movement). Test on frame *two*, not frame one, when caching something that moves.

## 2026-07-31 — v22 device checklist: Choke Point upgrades specialize instead of scaling everything

Choke Point's three tower types differed at tier 0 but converged in effect as they upgraded — all three tiers scaled range, rate and damage together, so upgrading was a flat power increase regardless of type rather than a choice about what to specialize in. Feedback asked for the opposite: Coil should gain splash on upgrade, Breaker should gain reach, Node should gain fire rate. Implemented as literal per-tier table entries (`TOWER_TYPES[type].tiers[n]`) rather than a formula, since the whole point is that each type's tiers grow a *different* stat — a shared multiplier would have defeated it.

Bounties were also cut ~35% and mount-equivalent costs (Choke Point has no mount cost, but Flak Battery's `MOUNT_COST` got the same treatment) raised, because a run could afford everything the economy offered well before the difficulty curve gave it a reason to. Same root cause in both games: kill income was tuned once, early, and never re-checked after later tuning passes made waves longer (more kills) without the economy side being revisited.

## 2026-07-31 — v22 device checklist: level 1 was the one shape with no gaps

Hull Breach's level rotation (`brickPresent`, `(level-1) % 4`) put the solid-wall pattern first. That's not an arbitrary difficulty spike — a solid wall is the only one of the four shapes with zero empty cells, meaning no gap for the ball to get behind the front row or bounce somewhere forgiving. It was, mechanically, the hardest pattern in the rotation, and it was also a new player's very first level. Feedback called level 1 "too hard" and levels 2-3 "fun" — which lines up exactly with solid-wall-first vs. everything-else.

Fix was reordering the cycle (checkerboard → pyramid → hollow frame → solid wall) rather than softening any one pattern, since the patterns themselves were fine — checkerboard and pyramid are legitimately easier because gaps let the ball recover. Two tests hardcoded "level 1 is a solid wall"; updated to assert the wall at level 4 (where `(4-1)%4===3` now lands it) instead of deleting the invariant.

## 2026-07-31 — v22 device checklist: multiball capped at 4, not 6

`MAX_BALLS` was 6, and the device checklist explicitly wanted to see six trailing interceptors on screen (a visual/perf check, not a fun check) — it passed. The separate fun-vs-chaos question got the opposite answer: six independently-bouncing balls to track was reported as chaos. Lowered the cap to 4 rather than compensating with a wider paddle tied to ball count, since paddle width already has an exact-value test (`w.paddle.w === L.PADDLE_W * WIDE_MULT` after a `multi` + `wide` combo) that a ball-count-dependent formula would have broken, and a simpler dial was available anyway.

## 2026-08-02 — One settings menu, not three corner buttons

Feedback: the mute, pause, and help buttons "sit on top of the game board and make some areas difficult to tap on." All three were independent modules (`shared/pause.js`, `shared/help.js`, `shared/audio.js`'s `mountAudioToggle`), each mounting its own always-visible circle in a corner — three overlapping hit targets on top of tappable board area, not one.

Replaced with a single `shared/menu.js` (`makeMenu`) behind one corner button. Opening it pauses the run — deliberately kept the exact contract `pause.js` used to expose (`{ paused, pause(), resume(), toggle() }`), since every shell's `frame()` loop already gates on `pause.paused` and rewiring four call sites for a renamed return shape would have been pure churn. The panel folds in `help.js`'s old rows/notes/lore content and `audio.js`'s mute toggle (which keeps its own `makeAudio()` sound engine — only the button-mounting function was superseded). An optional `onLevels` callback adds a "Levels" entry; only Hull Breach passes it.

`pause.js` and `help.js` are deleted outright rather than left as dead code — nothing imports them any more, and keeping unreferenced modules around invites a future session wondering whether they're still load-bearing.

## 2026-08-02 — Header safe-area was never actually complete

A prior fix (the `visualViewport` scroll listener in `shared/fit.js`) addressed the header *drifting* over a long session, but feedback said it was "still partially off screen... doesn't take into account the rounded corners or the camera/speaker cutout." Checking `shared/theme.css` found the real gap: `body`'s padding used `env(safe-area-inset-*)` for bottom/left/right at every breakpoint, but never `top`. The header was never inset-aware at all — it just happened to clear the notch on phones where the header was short enough (Feedline's 3-item HUD, versus 5-6 for the other three), which read as "Feedline is fine, the others aren't" when the actual cause was header height, not a per-game difference in the fix.

## 2026-08-02 — Choke Point: startWave now overlaps waves instead of refusing

"Start the next wave early" was previously read as "let the player begin the between-waves countdown sooner" — but the actual ask was to let wave N+1's enemies arrive *while* wave N is still on the board, a genuine mid-wave overlap. This meant changing `startWave`'s contract, not just its UI exposure: it used to hard-refuse (`if (w.waveActive) return false`), with a test (`'cannot start a wave mid-wave'`) pinning exactly that. Rewritten to append the new wave's spawn groups onto the existing queue (timed from the current clock) when already active, instead of resetting it — both waves' enemies now coexist. The old test was rewritten to assert the new overlap rather than kept as a regression guard for behavior that was, on reflection, the thing being complained about.

Rush Wave got a matching correction: it used to dump every remaining spawn onto the same tick (`s.at = min(s.at, clock)`), which is instant, not "fast-forward." Now each call compresses the remaining gap by a fixed fraction (`RUSH_COMPRESSION`), so repeated taps ramp the pace up rather than releasing the whole rest of the wave in one frame.

## 2026-08-02 — Ion cannon moved from a resistance stat to a deflection bypass

The original ion-cannon design (v24) gave `hardened` an `ionResist` field — a flat damage multiplier for every gun but the ion cannon. Feedback pointed out this picked the wrong kind: `shielded`'s frontal-arc deflection (bypassable today only by flanking) was the mechanic that actually wanted a gun-specific counter, and `hardened` — a kind with no directional weakness at all — didn't need one on top of just being tough.

The fix swapped which kind gets the special case rather than layering a second one on top: `isDeflected`'s call site in `stepShots` now skips the check outright when `shot.gun === 'ion'`, so the ion cannon penetrates `shielded` from any angle. `hardened` lost `ionResist` and is now hp-only, like `armored`; the railgun gets a `railBonus` multiplier against it instead — the same shape the resistance check used, just attached to a different gun/kind pair. Keeping the two mechanics (angle-based deflection vs. gun-specific bonus/resistance) structurally separate, rather than merging them, is what let this be a clean swap instead of a rewrite: a test asserts `isDeflected` itself is completely unaware `hardened` or the ion cannon exist.

## 2026-08-02 — Multi-barrel: battery-wide, not per-gun, and no new heat state

Feedback wanted a top-tier upgrade letting emplacements fire multiple barrels. Two shapes were possible: a per-mount stat (each gun independently upgradeable to more barrels) or one battery-wide dial affecting every mount at once. Went with battery-wide, matching how mount *count* already works (`MAX_MOUNTS`/`MOUNT_COST` — one number, not per-slot), rather than introducing the repo's first per-gun-instance upgrade path.

Barrels share the mount's existing single heat/cooldown pool rather than getting their own: firing 3 barrels costs 3x the heat per volley (`gun.heat += HEAT_PER_SHOT * S.heatPerShot * w.barrels`), which is the entire balancing mechanism and needed no new per-gun state. The angular fan for multiple barrels (`BARREL_OFFSETS`) reuses the same pattern the `spread` power-up already established for firing several shots off one aim angle.

## 2026-08-02 — A shot's colour is baked in at fire time, not read live

Reported as a bug: "projectiles fired from a cool barrel will turn red when the barrel later heats up." The shell's draw loop computed every shot's colour fresh each frame from `world.cannon.od` (the battery's *current* overdrive tier) — so a shot's displayed colour reflected the state of the battery *now*, regardless of what tier was active when it was actually fired. `fireGun` already baked `dmg`/`pierce` onto the shot object at fire time (so a shot's damage doesn't change after launch); colour just hadn't gotten the same treatment. Fixed by adding `shot.col` at creation (`gun.type === 'ion' ? G.col : T.col`, preserving the ion cannon's own fixed colour) and having the shell read `p.col` instead of recomputing. Worth remembering as a category: anything about to be baked onto an object at creation time should get *all* of its presentation state baked in together, not just the fields a test happened to check.

## 2026-08-02 — Drift Net → Feedline

Renamed for the third time (see the name-history note at the top of this file). Followed the same playbook as the 2026-07-30 all-four rename: full rename (directory, file names, internal game id, manifest entry, cabinet card, docs), accepting the loss of personal-bests keyed under the old id — there is one player, and it was already accepted once.

Caught in the process: the cabinet card's lore paragraph on `index.html` still had the "you are the thing that arrived" framing that the in-game help panel's lore line had already dropped a session earlier — the two copies had drifted because the fix only touched the file it was reported against. Worth a general note: when a copy fix is requested against one surface, grep for the same string elsewhere before assuming it's the only copy.

## 2026-08-02 — Flak Battery's standalone build is being retired (not yet done)

Noted here rather than acted on: the owner confirmed `flak-battery-standalone.html`/`build.mjs` — an early single-file distribution experiment predating the other three games — no longer needs to be maintained. Next session: delete the standalone file and `build.mjs`, remove its precache-exclusion comment from `sw.js`, and repoint `games/flak-battery/render-test.mjs`/`resume-test.mjs` at `flak-battery.html` directly (in-memory inlining via `tools/inline.mjs`, matching how the other three games' render tests already work without a checked-in standalone artifact).

## 2026-08-04 — The standalone build is gone

Done, as flagged above. `flak-battery-standalone.html` and `build.mjs` deleted; `render-test.mjs` now boots `flak-battery.html` through the shared harness like the other three games, and picked up a "the shell boots without throwing" test it never had (the standalone version asserted only on individual draw paths).

Worth stating the general lesson, because the artifact survived three sessions of "remember to regenerate it": **a generated file checked into the repo needs a reason to exist that outweighs being a standing staleness trap.** This one's reason evaporated the moment `tools/inline.mjs` could inline in memory — every regeneration after that was maintenance paid for nothing, and the one time it *was* forgotten, the render test silently validated old code for two builds.

## 2026-08-04 — "Header too high" was a flexbox overflow trap, not padding

Two rounds of feedback said the header sat wrong, and the first fix (adding `env(safe-area-inset-top)`, v25) was correct but incomplete. The actual clipping came from `body { display:flex; align-items:center; overflow:hidden }`: **a centred flex item taller than its container overflows equally in both directions**, and with `overflow:hidden` the top half becomes unreachable — there is no scroll position that can reveal it. On a short phone with the shell at full height, that ate the header.

`align-items:flex-start` fixes it permanently; content can only ever overflow downward, which `overflow:hidden` handles gracefully. Worth knowing generally: centring is safe only when the item is guaranteed smaller than the container, and `overflow:hidden` turns "slightly too tall" into "silently unreachable" rather than "scrollable".

Related, found in the same pass: `fit.js`'s `GAP_AND_PADDING = 34` was a hardcoded stand-in for furniture that varies — the ≤560px media query drops body padding from 16px to 8px, and safe-area insets are unknowable at author time. It now measures the body padding, every `#shell` child that isn't the board, and the flex gaps. **A consequence worth remembering: Choke Point had to stop passing `extra`.** Its controls strip is a shell child, so measuring counted it and `extra` counted it again — the board shrank by the strip's height twice. `extra` is now documented as being only for furniture that lives *outside* `#shell`.

## 2026-08-04 — Choke Point's dead space was the button layout, not the grid

Reported as "make the game board bigger — there is dead space on the left and right". The instinct is to change the grid, and the plan called for exactly that — which would have meant redrawing all three hand-authored routes and re-validating the transpose invariants.

Measuring first showed the board was **height**-constrained, not width-constrained: `makeFit` takes `min(availableHeight, stageWidth / ratio)`, and the controls strip was 225px — three wave buttons at `flex: 1 1 100%`, each forced onto its own row, eating 28% of an 812px screen. Putting them in one row cut the strip to 165px, and the board went from 318×478 to 357×536 — the full 359px stage bar a 2px rounding gutter, with the grid and routes untouched.

The general shape: **when something looks too small, measure which constraint is actually binding before changing the thing that looks wrong.** The grid was never the problem, and changing it would have been a large, risky edit that also raised difficulty as a side effect.

## 2026-08-04 — Fast-forward steps more times; it does not step bigger

Choke Point's fast-forward runs `E.step(world, dt)` N times per frame rather than `E.step(world, dt * N)`. The engine is a pure function of `dt`, so the second looks equivalent and is not: at 4× a frame becomes ~133ms, far past the intervals the tower cooldowns and spawn release assume, and enemies would jump between positions instead of moving through them. Repeating a normal-sized step keeps every interval the engine sees identical to 1× — there are simply more of them, which is what "faster" should mean.

This is also why the multiplier lives entirely in the shell: nothing in the engine needs to know it exists.

## 2026-08-04 — Health as brightness, and why `dim()` had to be shared

Both Flak Battery (hp numbers on tough craft) and Choke Point (hp bars above every enemy) dropped their numeric readouts in favour of the thing simply going dark as it takes damage. On boards carrying 78 craft and 30+ enemies respectively, per-object numbers were competing with the thing the player is actually tracking.

The implementation forced a shared helper. `glowStroke` takes an `intensity` argument, but `extrude`/`extrudeRect`/`cube` do not — they issue several strokes *and* opaque fills internally, so one alpha could not describe "dimmer" for all of them, and a caller-side `globalAlpha` is explicitly documented as not working (each pass sets its own). So `dim(col, k)` scales the channels instead: for additive glow that is equivalent to lowering intensity, and it correctly darkens the opaque body fills too. Both games needed the identical maths, which is what made it `glow.js`'s problem rather than each caller's.

## 2026-08-04 — The "3D" cue was the joining edges, and the body fill

"Make the squares look more 3D" turned out to have two concrete causes, both already solved elsewhere in the repo and neither obvious from the phrasing.

First: `cube()` in `glow.js` strokes the four edges linking the front face to the offset back one, and its own comment already says these are "what say 'solid', not 'two squares'". Choke Point's enemies were using `extrudeRect`, which does not draw them; Flak Battery's segments were hand-rolled and omitted them. Adding them is most of the effect.

Second: both had near-black body fills, so the shape read as an outline on a dark board. The fix was already recorded verbatim for Choke Point's *towers* — at the default near-black the fill vanished into the background and the tower read as a hollow ring rather than as a solid object. The same lesson had to be learned twice because it was written as a comment on one call site instead of as a property of the technique.

## 2026-08-04 — Bigger craft need bigger spacing, and spacing caps chain length

Flak Battery's craft were drawn at `long = r * 2.8` (~36px) against a `spacing` of 30. Wider than the gap between them, so a chain fused into one continuous fence — the individual craft were not merely small, they were *invisible as objects*. Enlarging them without touching spacing would have made that strictly worse. Only rendering a real frame to PNG caught it; every test still passed.

So `SEGMENT_SPACING` became a named export at 42, with square craft at `r * 2.7`. That trade has a hard ceiling worth recording: the portrait path is ~4374px, so the 78-craft cap spans ~3276px, about 75% of the run. Push spacing or the cap much further and the tail is still entering while the head is at the floor, which makes recoil meaningless and eventually laps the chain onto itself. **Future difficulty should come from `hpScale`, which has no geometric ceiling** — a note now sits in the code beside `waveCount`.

A test failure caught something related and worth keeping: raising hp far enough meant a blindly-sweeping test bot could no longer chew deep enough to reach a splitter, so `'splits happen during real play'` started failing. The mechanic was fine; the bot was under-equipped for the wave it was testing. It now buys the upgrades and mounts a real player would have by then — a reminder that a test simulating "real play" has to keep simulating a *plausible* player as the balance moves.

## 2026-08-04 — Game gating is cabinet-only, deliberately

First-play-through unlocks (Flak Battery after a Feedline run, Choke Point at Flak Battery wave 10, Hull Breach at Choke Point wave 10) are enforced on the cabinet only. Direct URLs, bookmarks and the installed PWA's four shortcuts all still open any game, and `manifest.webmanifest` is untouched.

That was an explicit call rather than an oversight. Enforcing it inside each shell means four redirect paths, a way to strand somebody who deep-linked, and a real risk of locking out a player whose progress failed to persist — all to protect single-player progression that only one person can "cheat", and who chose the gate. Locking the front door is the entire intent.

One implementation note: progress is recorded by the games directly (`recordProgress` in each shell) and **not** inferred from `scores.js`. `submit()` only writes when a score improves, so a short run after a good one records nothing — reaching wave 10 once and then playing badly would have left the gate shut.

## 2026-08-05 — The side gutters were the safe-area insets, and v26's fix never touched them

v26 "fixed" Choke Point's dead space by shrinking the controls strip, measured a 2px gutter at 375×812, and shipped. The next round of feedback said the dead space was still there.

It was, and the measurement was the problem. At 375×812 the board cleared the stage width by **three pixels** — on a desktop browser, where `env(safe-area-inset-*)` evaluates to 0. A real iPhone spends 44–59px on the notch or Dynamic Island and ~34px on the home indicator. Feeding those back through the same arithmetic (extra body padding standing in for the insets) produced a **63px gutter on each side**, which is the reported dead space almost exactly.

Two things worth keeping from this:

- **A layout measurement taken without simulated insets is not a measurement of a phone.** It is a measurement of a desktop that happens to run the same CSS. Any future check of "does the board fill the width" has to add the insets explicitly, and the browser pass in CLAUDE.md now says so.
- **`min(availableHeight, stageWidth / ratio)` pays every height shortfall out of the width.** That is right when the whole board must be visible without scrolling, and wrong when the board is the thing you are aiming taps at. `makeFit` gained an opt-in `fillWidth` that spends the full width and lets the page scroll instead, paired with a `body.scrolls` class because the default `overflow:hidden` would otherwise make the pushed-down furniture unreachable. Gutter is now 2px at every inset level tested, and the board on a notched 375px phone went 296px → 357px wide.

The grid, `CELL` and all three routes were left untouched. The plan had called for changing them; the measurement said not to.

## 2026-08-05 — Choke Point: towers level themselves, money buys the class

The manual three-tier upgrade is gone. It always lost the same argument: an upgrade competed for scrap with another tower, and another tower nearly always won, so the tiers were something you bought when you had run out of places to build.

Splitting the two solves it. Towers earn their own levels by fighting — XP for damage dealt, up to level 10 — and money buys a **per-class armoury** that persists between runs. Placement earns, purchase compounds, and neither is spending the other's currency.

Three details that are not obvious and are load-bearing:

- **XP is capped at the target's remaining health.** Credit the full swing and a Breaker parked over the spawn levels fastest of anything on the board, on damage that killed nothing. Overkill pays what it killed.
- **Each class buys its speciality cheap and its opposite dear** (Node rate/splash, Breaker splash/rate, Coil range/damage). Without that the four tracks are the same four tracks for everyone and the three classes converge on whichever build is strongest. The discount is what keeps a Node a Node however much goes into it.
- **The engine holds `classUpgrades` but never touches storage.** `stats(w, tower)` has to be the only place numbers come from, so the armoury lives on the world; the shell loads and saves it. Same split as every other engine here, and the reason `resetGame` deliberately leaves it alone.

Because the armoury only ever grows, every run after the first would otherwise be easier than the last. **Difficulty (easy/medium/hard) is the counterweight** — the player's dial rather than automatic scaling, and it rides along with the score so a Hard wave 14 is never filed against an Easy one.

## 2026-08-05 — Fast-forward and rush are different controls, and deleting one was a mistake

v26 removed `rushWave` on the reasoning that the new fast-forward covered it. It does not, and the distinction is worth stating because it was got wrong once already:

- **Fast-forward speeds up time.** Towers fire proportionally faster, so the wave is exactly as hard and merely shorter. It is a convenience.
- **Rush speeds up the enemy.** Towers keep reloading at their normal rate while the wave arrives sooner. It is a gamble taken for the bounty.

Restored, alongside fast-forward and auto-advance, which are three answers to three different wants. This supersedes the v26 entry claiming the engine "got smaller" by dropping it — it got smaller by dropping something that was doing a job.

## 2026-08-05 — Flak Battery: upgrades per emplacement, with the prices left alone

The four branches moved off the world and onto each gun; `stats(w)` became `stats(w, gun)` and every caller now has to name a mount. The mechanical part was a wide but shallow refactor. The design decision was **not rebalancing afterwards**.

Under the old shared tree a new mount arrived already carrying every tier the first had bought, so more mounts was strictly more gun and the only question was how fast you could afford them. Now a mount arrives bare and the full tree costs five times as much, which is the entire point: a fifth gun competes directly against deepening the four you have. Wide-and-shallow covers the board; narrow-and-deep punches through armour; no run affords both.

Worth flagging for whoever tunes this next: the five-fold bill is deliberate, not an oversight, and `fullBatteryCost()` exists to make the ceiling checkable.

## 2026-08-05 — The mortar's `arc` flag had never been read by anything

`fireGun` set `arc: G.arc` on every mortar round and **nothing anywhere consumed it**. The gun's entire selling point — "reaches over the front rank" — described behaviour that did not exist, and had not since the mortar shipped. The tuning was fine; the feature was absent.

Rounds now carry a `travelled` distance and cannot collide inside `MORTAR_ARM`. Implemented as an arming distance rather than a real parabola because the board is top-down: there is no third axis to arc through, and "cannot hit anything for the first N pixels" is the same rule a lob actually gives you. The shell draws the height that is not in the model.

The general lesson is about flags rather than mortars: **a field set at one end and read at neither is invisible to every test that does not assert on behaviour.** The unit tests all passed, the render tests all passed, and the gun was inert for months. The new tests assert that a lobbed round *misses* something a plain round hits at the same range — a behavioural claim, not a field check.

## 2026-08-05 — Extra barrels are lateral, not angular

`BARREL_OFFSETS` used to be an angular fan: same muzzle, slightly different headings. That is not what extra barrels look like — they sit either side of the main one and fire alongside it, and a fan diverges more the further the rounds travel.

Now the offset displaces the muzzle perpendicular to the aim and every round keeps the identical heading, so they stay parallel for their whole flight. Flanking rounds are smaller and weaker (`SUB_BARREL_DMG`/`SUB_BARREL_R`), which is what keeps a third barrel from being a third whole cannon.

Both the mount art and the shop portrait **read the offsets from the engine** rather than eyeballing a matching drawing. The picture and the geometry cannot drift apart, which they otherwise would the first time either was tuned alone.

## 2026-08-05 — The wave-7 cliff, and why more columns was the wrong answer

Reported as "after wave seven the difficulty drops too fast". The cause is exact: `waveCount` is `min(20 + wave*9, 78)`, which reaches its ceiling at wave 6.4. From wave 7 the column stops growing, and length is the escalation a player can actually *see* — speed keeps climbing to wave 12 and `hpScale` to 18, but neither reads as "more" the way a longer column does.

A second and third column looks like the obvious fix, and it is recorded here as rejected so it is not retried on the same reasoning. **Splitting a wave's craft across two chains is not the neutral rearrangement it appears to be.** Each chain grows its own head; a head is both the toughest kind and body-armoured while anything trails it. Two columns of 39 therefore carry ~21% more health than one of 78, and much more of it sits behind armour. Measured against the balance guard, that step put a *perfectly played, fully maxed* battery into its first breach the moment the second column appeared — at every threshold tried, waves 13 through 16. The board got harder in a jump rather than on a curve.

The climb comes from `hpScale` instead, which is what the note on `waveCount` had recommended all along: a `past7` term on top of the existing rate, 26% steeper at wave 14 than v26 and still rising where v26 flatlined at its cap.

Method note, because it is the reusable part: every number above came from running the balance guard's own bot headless and printing the wave at first breach. Three tuning attempts were rejected on measurements, not on how they read.

## 2026-08-05 — A breach opens the shop, and the same wave comes back

Losing a life used to respawn the wave instantly. That meant the only chance to spend scrap was a clean clear — precisely the run you had not just had — so the scrap earned off the column that broke through had nowhere to go.

`breach` now sets `shopOpen` and a `retry` flag; `nextWave` reads `retry` to know this is the same wave again rather than an advance. The shop titles itself "Regroup" instead of "Refit" and its button says which wave it is putting you back into, because landing in a shop headed "Next Wave" after losing one reads as the game having skipped it.

## 2026-08-05 — Touch aiming splits on the breach line

Relative dragging exists so a thumb can rest low and never cover the board. That reasoning holds *below* the floor line, where the battery and thumb band are. It does not hold above it: if you have already reached into the play area then your hand is over the board regardless, and at that point relative dragging is strictly worse than pointing at what you want to hit.

So the rule is now positional. Below `FLOOR`, the drag as before. Above it, the guns point where the finger is — routed through the existing `aimTarget`/`slewAim` path, so the traverse cap still applies and tapping across the screen swings the turret rather than teleporting it. Crossing the line mid-gesture switches modes, which is what a rule stated as "above the line" should do.

`FLOOR` was chosen over an invented band because it is the line a craft breaches at: the player can already see it.

## 2026-08-05 — Audio was resumed on a one-shot listener

Reported as "sound doesn't work". Instrumenting the live page showed the context created, `state: "running"`, and oscillators produced on cue — so the wiring was fine and the bug was elsewhere.

`menu.js` resumed the AudioContext on `pointerdown` with `{ once: true }`, on the reasonable-sounding theory that a context needs waking exactly once. It does, until something suspends it again, and on iOS plenty does: backgrounding the tab, an incoming call, locking the phone, re-entering the installed PWA. After any of those the context returns suspended and, with the listener already spent, nothing was left to wake it. The game played on in silence for the rest of the session.

Resuming is a no-op on a running context, so the fix is simply to stop being clever: wake on every gesture, plus on `visibilitychange` — which is the exact moment an interruption ends and before the player has touched anything.

Separately, `fire()` was the quietest entry in the library at `gain: 0.12` against 0.2–0.3 everywhere else, and at 50ms through a phone speaker it was not really there. Raised to 0.2, still under the impact sounds it causes.

## 2026-08-05 — Test helpers that assume the map

Reordering Choke Point's routes by difficulty broke a dozen tests at once — tests about armour, splash resistance, slow immunity and target re-acquisition, none of which have anything to do with route order.

The cause was two helpers that took `firstBuildable(w)` (the first non-path cell, scanning from the top-left) and then looked for a path point within range of it. That only ever worked because route 0 happened to start in the top-left corner and run along the second row. The helpers now search for a cell that genuinely overlooks a stretch of route, with a `span` argument for tests that need two enemies near each other.

The pattern is worth naming: **a fixture that depends on incidental map geometry fails far from its cause.** Nothing in "armour blunts small hits" hints that it is coupled to where route A starts. Searching for what the test actually needs is barely more code and does not care what shape the board is.

A second instance of the same class, in Hull Breach: a new pierce test set up a ball and a brick but left `w.running` false, so `step` returned immediately and the ball never moved. The assertion was on the velocity the ball *started* with — so it passed, for entirely the wrong reason. Assertions about "did this change" want a before-and-after, not a state that a no-op also satisfies.
