# STATUS

Last updated: 2026-07-31

## Read this first

This is the "pick back up" file — check here before touching code. See [CLAUDE.md](CLAUDE.md) for architecture (and for how this file is meant to be maintained), and [docs/DECISIONS.md](docs/DECISIONS.md) for why past choices were made.

## What's playable

Serve the repo first — the shells use ES modules, so `file://` won't work:
`python -m http.server 8123`, then open `http://localhost:8123/`.

- **The cabinet** ([index.html](index.html)) — the front door, listing all four games. Each game links back to it.

- **Flak Battery** ([games/flak-battery/flak-battery.html](games/flak-battery/flak-battery.html)) — playable, backed by a tested engine ([engine.js](games/flak-battery/engine.js) / [engine.test.js](games/flak-battery/engine.test.js)). [flak-battery-standalone.html](games/flak-battery/flak-battery-standalone.html) is a *generated* single-file build — never edit it directly, run `node games/flak-battery/build.mjs`.
- **Hull Breach** ([games/hull-breach/hull-breach.html](games/hull-breach/hull-breach.html)) — playable and complete: paddle-angle steering, armoured back rows, four rotating level patterns, lives, level-clear bonus.  Verified end to end in a browser (play, ball loss, game over, restart, level advance).
- **Drift Net** ([games/drift-net/drift-net.html](games/drift-net/drift-net.html)) — playable and complete: buffered turning, deferred growth, expiring gold bonus, speed ramp, board-full win. Arrows/WASD plus swipe.  Verified in a browser (steering, reversal blocking, eating, wall death, banner, restart, bonus render).
- **Choke Point** ([games/choke-point/choke-point.html](games/choke-point/choke-point.html)) — playable and complete: grid tower-defense, three tower types (node/breaker/coil) with three tiers, escalating endless waves, charge economy, core integrity, tower upgrade/sell, lossless rotation. Tap to build.  Verified in a browser (build/economy, wave spawn+clear, kills, leaks→game over, score persistence, transpose rotation + pause, upgrade popup, audio mute).

**331 logic tests pass** (`node --test games/*/engine.test.js shared/*.test.js`) — Flak Battery 181, Hull Breach 58, Choke Point 46, Drift Net 44, shared 2 — plus **33 render and resume tests** (`node --test games/*/render-test.mjs games/*/resume-test.mjs`, after `npm install --no-save jsdom canvas`).

## In progress / just decided

- Built Drift Net under `games/drift-net/` — first grid/tick game, and the one that showed the engine/shell *seam* is legitimately per-game (Drift Net's engine owns its tick clock; Hull Breach's takes no input at all). The pure-logic principle is what's shared, not the `step` signature.
- Built Hull Breach fresh under `games/hull-breach/` on the engine/shell split — second game in the layout, and confirmation the pattern works for something other than Flak Battery.
- Scrapped the old `arcade_games.html` (monolithic five-game cabinet). It was pulled from a larger personal site — depended on missing nav/theme chrome (`index.html`, `tracker.html`, `shared/theme.css`) and a live high-score backend (secret `SCRIPT_URL`/`API_TOKEN`) we don't have — and used the one-big-file structure we've decided against. See [docs/DECISIONS.md](docs/DECISIONS.md).
- **`shared/` extracted** — `theme.css`, `fit.js`, `fx.js`, with all three shells rewired and verified in a browser. Two things were deliberately left unshared (banner logic, engine `step()` signatures) — see shared/README.md.
- **The PWA layer is in** — `manifest.webmanifest`, `sw.js`, `shared/pwa.js`, and a generated icon set. Verified offline by stopping the server: pages load, fonts render, games play, and an uncached URL falls back to the cabinet.
- **The cabinet exists** — `index.html` ties the three games together, so this is an app rather than three loose pages. Plain links, no router, no framework.
- **Portrait layouts** added to Hull Breach and Drift Net, so all three games are phone-shaped. Verified at a 375x812 viewport: Hull Breach uses 88% of viewport height, Drift Net 83%, and a drag in Hull Breach's thumb band steers the paddle without covering the court.
- **Fonts are self-hosted** from `shared/fonts/`; nothing loads from the Google Fonts CDN any more, which was the last thing standing between the games and working offline.
- **Flak Battery's missing `build.mjs` now exists**, so the standalone single-file build is generated rather than hand-synced. This was forced by the extraction: the standalone has to inline the shared files too, and `render-test.mjs` tests the standalone — a stale one meant the render test was silently checking old code. Regenerate with `node games/flak-battery/build.mjs`.
- Fixed a pre-existing Windows bug in `render-test.mjs` (it used `URL.pathname`, which yields `/C:/...` with percent-encoded spaces). The render test had evidently never run on this machine; it passes now.
- Long-term stretch goal: ship as a phone app. Plan is PWA first (installable, offline, cheap, no rewrite needed); native wrapping (e.g. Capacitor) only if app-store distribution becomes a real need later.

## Immediate next step

**The road to a shippable phone app, in agreed order** (see DECISIONS.md for why this sequence):

1. ~~**Extract `shared/`**~~ — **done.** `shared/theme.css`, `shared/fit.js`, `shared/fx.js`, all three shells rewired. See [shared/README.md](shared/README.md).
2. ~~**Self-host the fonts**~~ — **done.** `shared/fonts/` holds Chivo Mono (variable 300–700) and Archivo Black, latin subset, both OFL-1.1 with licenses shipped. Verified: the served games now make **zero** external requests, and the standalone makes zero subresource requests of any kind.
3. ~~**Portrait layouts for Hull Breach and Drift Net**~~ — **done.** Both have `LAYOUT_TALL`, picked at load by aspect ratio. Hull Breach gained a `FLOOR`/`THUMB` split and height-scaled ball speed; Drift Net needed neither (per-cell pacing). Safe-area insets added to `shared/theme.css`. All three games now handle portrait.
4. ~~**The cabinet**~~ — **done.** `index.html` at the repo root lists the three games; each game header has a `← Arcade` link back. The standalone build strips that link, since it travels alone.
5. ~~**PWA manifest + service worker**~~ — **done.** Installable, and verified genuinely offline: with the server stopped, every page still loads, renders with the right fonts, and plays.

**All five steps are complete. The PWA is finished.** What remains before a store submission is game depth, not plumbing — see the store section below.

Do **not** try to unify the engine `step()` signatures — those differ per game on purpose (see DECISIONS.md).

## Store readiness (decided 2026-07-27: Google Play first, Apple deferred)

Neither store takes a PWA directly — both need a native binary. **Google Play is the real near-term target**: a TWA built with Bubblewrap, $25 one-time, far more permissive review, and no Mac required. The Pages HTTPS domain satisfies the Digital Asset Links requirement, subpath included.

**Apple is deferred, not cancelled** — $99/yr plus a Mac plus stricter review isn't worth scheduling against yet. The Guideline 4.2 work below already landed and isn't wasted: scores, audio, and depth make the Play listing better too. Treat the 4.2 checklist as done-and-banked rather than as the thing currently driving priorities.

Original 4.2 (minimum functionality) checklist — three simple arcade games with no scores, audio, or progression is the profile Apple rejects; Play would have accepted it from the start:

- [x] Score persistence — `shared/scores.js`, personal bests in localStorage, shown in each game's HUD, on the game-over banner ("New best"), and on the cabinet cards. No backend, no identifier, no privacy surface.
- [x] Audio — `shared/audio.js`, all effects synthesized with WebAudio (no sound files, stays offline). Mute toggle per game, remembered. Wired into all three.
- [x] More depth — added Choke Point, a grid tower-defense (a genuinely different genre: placement + economy, not reflex). Hull Breach powerups / further games remain options but the 4.2 bar is now much better answered.
- [x] Real-device testing — done once, on a phone via GitHub Pages. Findings acted on (see below); worth repeating after every batch of feel changes.

**Guard this:** no tracking, no ads, no accounts, no network calls. That keeps Apple's privacy label "Data Not Collected" and Play's Data Safety form near-empty, which is where most submission pain lives. Adding an analytics or ads SDK imports that whole compliance surface.

## Hosting

Deployed to GitHub Pages at **https://tiberiousdoom.github.io/Arcade/** — from the `main` branch, root directory. Pushing to `main` redeploys; there is no build step.

Pages serves project sites from a **subpath** (`/Arcade/`, not a domain root), which is why every path in the app is relative — `start_url`/`scope` of `./`, relative precache entries, and a worker URL resolved from `import.meta.url`. This was verified by serving a copy under `/Arcade/` locally and confirming the worker registers at the right scope and the app still runs with the server stopped. **An absolute path anywhere would break the deployment**, so keep them relative.

`.nojekyll` is present so Pages serves files verbatim instead of running them through Jekyll.

## Device feedback, round one (acted on)

From a real phone, via the Pages deploy:

- Rotating kept the *portrait* board and shrank it to 19% of screen width — layout was picked once at load and never re-picked. **Fixed**, and rotation now hands the game over to the other board while keeping your progress.
- Hull Breach's portrait thumb rest sat too shallow → deepened (190 → 250).
- In landscape a thumb covered the paddle, with dead space either side → the side gutters are now live control surface (drag there to steer; tap the board to jump the paddle).
- Flak Battery's portrait board was nearly square (880x800) and wasted a third of the screen → now 600x1150 with ten rows.
- Trim buttons ate scarce screen for little gain → removed.
- Drift Net's swipe threshold swallowed deliberate flicks (24px → 10px).
- Flak Battery's aim needed ~500px of drag to cross its arc, more than a phone is wide → gain roughly doubled, now ~245px.
- Instructions overflowed the banner and were written for mouse and keyboard → moved behind a `?` button per game, rewritten for tap and swipe.

## Device feedback, round two (acted on)

- Instructions were still too detailed → cut to three short lines plus two notes per game.
- Flak Battery's map appeared to reverse on rotate → its portrait board had ten rows against landscape's seven, and the path serpentines, so the same path fraction landed in a row running the opposite way. Row counts now match (7 both ways); the extra portrait height goes into row spacing.
- Drift Net did not feel like it kept your place → the grids are now exact **transposes** (32x18 / 18x32), so rotation transposes every cell and is lossless. Turning the phone turns the board.
- All three games now **pause on rotate** with a "Turned / Resume" banner rather than dropping you back in mid-flight.
- Gutter drag and the new aim gain were both confirmed good on device — left alone.

## Device feedback, round three (acted on 2026-07-27)

- **Landscape is gone — portrait only.** It "didn't look or feel quite right" on a real phone. Done as a **reversible flip**, not a deletion: each shell has `const PORTRAIT_ONLY = true` beside `pickLayout()`, and `LAYOUT`, `relayout`, the rotation handover and all their tests are intact but inert. `manifest.webmanifest` is now `"orientation": "portrait"`. **Caveat worth knowing: the manifest only locks orientation once installed as a PWA** — a plain browser tab cannot be orientation-locked, so a sideways phone on the Pages URL just gets a letterboxed portrait board. Play it for a while; if portrait-only sticks, *then* delete the machinery (see DECISIONS.md).
- **Choke Point's grid went 15x10 → 12x8** (`CELL` 52 → 64). The reported "squares too small" is not a `CELL` problem — `makeFit` scales the canvas to the stage, so `CELL` is only backing-buffer resolution and on-screen cell size is `screen width / COLS`. Fewer columns is the only lever. On a 375px-wide phone cells went ~36px → ~45px. The route was redrawn to fit and the transpose invariant still holds.
- **Choke Point palette buttons enlarged** (min-height 54 → 72px, larger type), popup buttons too. Showing/hiding Start Wave now re-fits the board — the strip's height is reserved by `makeFit`, and it was changing without a re-fit.
- **Towers no longer freeze their barrel between shots.** `step` acquired a target only at the instant a shot was allowed, so `tower.aim` went stale for the whole cooldown and the shell (which correctly refuses to draw at a dead enemy) drew nothing. Targets are now acquired every frame; firing is still gated on cooldown.
- **The upgrade popup stays open on upgrade**, re-rendering tier and cost in place; only an outside tap (or a sell) closes it. Its Upgrade button now also tracks affordability live as kills come in.
- **Flak Battery aim is now corrected per input device**, since the report was opposite on the two: unclearable on a phone, trivial with a mouse. Touch gets `AIM_ASSIST_R` (9px of extra hit radius — forgiveness where the input is imprecise); mouse gets `TRAVERSE_MAX` (5.6 rad/s, so the turret swings rather than teleports to the cursor, ~0.46s for the full arc). The drag gain curve was left alone. **These two constants are the dials for the next playtest.**

## Hull Breach powerups (added 2026-07-27)

The first depth work rather than feel work, and the item `w.balls` was built as an array for. Four capsule drops, each reusing something already in the engine:

- **`multi`** — splits every live ball into three, fanning ±0.42 rad off its heading, capped at `MAX_BALLS` (6) so stacked splits taper instead of filling the board.
- **`wide`** — paddle ×`WIDE_MULT` (1.6) for `EFFECT_SECONDS` (12). Re-clamps on pickup, so grabbing one while hard against a wall pushes the bar back inside it.
- **`slow`** — ball speed ×`SLOW_MULT` (0.72) for 12s. Rescales live balls and the next launch, direction untouched.
- **`life`** — a spare ball, instant.

**Which brick drops what is pure arithmetic on `(level, row, col)`** (`dropFor`), because this engine has no randomness anywhere — so a level's drop map is identical every run and in every test, and is therefore learnable. Same reasoning as `brickPresent`. About one brick in seven drops; the weighting lives in a table's repeats rather than a branch, with `life` one entry in eight.

Timed effects are cleared on life loss, `nextLevel` and `resetGame`, and **survive a relayout** (they were earned) while in-flight capsules do not (their position means nothing on a new board). 16 new engine tests. The shell draws capsules as coloured pills with a one-letter glyph, tints the paddle while `wide` is up, and shows remaining time as slim bars just inside the floor line — bottom-left, because the audio and help buttons own the top corners.

Verified in a browser: all four catch correctly through the real `step()`, and the draw path was exercised with every kind on screen plus the empty case.

**Not tuned on a device.** The dials are `EFFECT_SECONDS`, `WIDE_MULT`, `SLOW_MULT`, `MAX_BALLS`, and the one-in-seven drop rate in `dropFor`.

## Flak Battery difficulty rework (2026-07-27)

Device feedback confirmed the aim rework was right, and asked for more difficulty. Three real gaps were found in the code, not just tuning:

- **Segment hp never scaled with the wave at all.** `KIND` hp were fixed constants; only length and speed moved. Added `hpScale(wave)` (+14%/wave, capped ×4), mirroring Choke Point's. Volatile splash and split-grown heads scale with it too, or they'd quietly stop mattering.
- **Wave 1 was already a full variety pack.** `kindForIndex` took no wave, so its modular rules fired from wave 1 — armored, volatile, shielded, regen, carrier *and* a splitter, all at once. That's why it read as a wall. Now `KIND_UNLOCK` introduces kinds one at a time: std 1, carrier 2, armored 3, volatile 4, shielded 5, regen 7, splitter 9. **Wave 1 is deliberately easier than before**; the curve gets harder from wave 3 on.
- **Length flatlined at wave 9.** `waveCount` was +3/wave capped at 40; now +4 capped at 56, which still spans well under half the path.

Measured curve: wave 1 is 18 segments / 65 total hp, wave 10 is 54 / ~640, wave 25 is 56 / ~1024. A fully maxed battery with perfect aim clears wave 46 without a breach, so the cap is not a wall — there's a test pinning that it reaches wave 20 untouched.

**The head.** Killing the head now destroys the whole chain and scores every remaining segment — but the head is *armoured by its body*: incoming damage is multiplied by `headDamageFactor(bodyLeft)` = `1/(1+bodyLeft)`. This matters because the head sits at index 0, the **leading** segment: closest to the battery and first to breach. An unprotected instant-kill head would have been the easiest shot on the board and would have made recoil, mid-chain cutting, splitters and flanking all pointless — a large difficulty *decrease*. With the penalty it's a risk/reward call: clear the body, or spend a burst on an early decapitation. Made visible by a ring around the head that thins as the body clears, plus a white flash when a shot is absorbed.

**GUI polish** in the same pass: the `.meta` HUD now gives the value weight and the label none (shared, so all four games benefit) at a 4px header cost; shop tap targets went from ~28px to 42px (`.buy`) and 26px to 34px (`.chip`); and "can't afford" is now visually distinct from "maxed" and states the shortfall ("40 · need 15 more") instead of leaving you to subtract.

**Build version:** `shared/version.js` holds one app-wide `BUILD`, shown in every help panel and the cabinet footer. This exists because cache-first serving means a phone can silently keep an old build — now it's answerable in two taps. `shared/version.test.js` fails if it drifts from `sw.js`'s `CACHE_VERSION`.

## Choke Point depth (2026-07-27)

Three of the five ideas from the depth discussion, chosen as the ones that add decisions rather than content.

- **Three circuits, not one.** `ROUTES` holds three routes; a run picks one from its seed, and `resetGame` advances to the next so **Play again is a different board**. Per run, not per wave — swapping the path mid-run would strand towers. Each route is validated by test: axis-aligned legs (`pathCells` walks a cell at a time and relies on it), inside both grids, transposing cell-for-cell, identical length landscape vs portrait, and leaving 60+ buildable cells. `relayout` now carries `routeIndex`, which it previously would have silently reset to route 0 — that regression is tested. The HUD names the circuit (A/B/C), because otherwise a changed board on replay reads as a glitch.
- **Enemies have abilities, not just bigger numbers.** Previously they differed only in hp/speed/bounty, so more of whichever tower was strongest was always right. Four traits — `armor` (flat reduction, punishes Node's many weak shots), `splashResist` (punishes Breaker's area damage), `slowImmune` (Coil can't set it up), `heals` (target priority starts to matter) — and four new types carrying them: Swarm (many/tiny, what splash is *for*), Shell (plated), Phase (insulated + unslowable), Patch (repairs neighbours). `ENEMY_UNLOCK` introduces one per threshold: swarm 4, shell 7, phase 9, patch 11.
- **Coil is now a setup piece.** Anything slowed takes `SLOW_BRITTLE` (×1.4) extra damage from everything. The ordering is deliberate and tested: the bonus reads the slow *already* on the target, so a Coil's own shot gets nothing and it functions as support rather than a weak gun.

Curve after the change: wave 1 is 8 enemies / 160 hp, wave 7 is 42 / ~1400, wave 14 is 77 / ~4580.

Readability had to keep up, since "my towers aren't working" must read as *wrong tool* rather than *bug*: each trait gets a silhouette cue (heavy ring, dashed shell, chevron, cross), a patch draws its heal radius, and a mend flashes green. One collision was caught only by screenshot — the old slow tint repainted enemies in almost exactly Shell's blue, so `slow` is now a translucent frost *over* the type colour rather than a replacement.

**Not done, deliberately:** projectiles (worth more once the above is played — travel time makes leading targets and placement angles matter, multiplying these changes rather than standing alone) and the between-waves choice. Difficulty numbers are still untuned by play.

## Art direction: vector/CRT, piloted on Drift Net (2026-07-30)

Decided against sprites and for an emissive vector look built in Canvas 2D — see `docs/crt-demo.html` (live at `/Arcade/docs/crt-demo.html`) for the four techniques compared, and DECISIONS.md for why.

`shared/glow.js` holds the primitives: `glowStroke` (multi-pass emissive stroke — everything else builds on it), `glowDot`, `inkDot`, `extrude`/`extrudeDisc`/`extrudeRect`, `fadeFrame`, `scanlines`. All reduced-motion aware.

**Drift Net is the pilot.** Its wire is now one continuous glowing polyline rather than per-cell shapes — truer to the name, and four stroke passes for the whole body instead of eight per cell, which on a long wire is the difference between a handful of draws a frame and several hundred.

`tools/screenshot.mjs` renders a real frame to a PNG through the render harness. Art cannot be judged from a headless browser at all — rAF is throttled until the page stops compositing, so screenshots come back blank.

**Choke Point is done too** (taken out of order, at request). It gets the glow and the extrusion but **no phosphor trails** — a TD needs precise, unsmeared positions, and trails would fight the trait cues. Enemy bodies stay fully solid with halos outside them; the trait cues stay hard-edged and unglowed.

**Remaining:** Flak Battery and Hull Breach. Neither game is yet seen on a real device.

## The setting (decided 2026-07-30)

The four games are one story, and were renamed to match it. **You play the invasion first, then defend against it twice, then answer it.**

| # | game | you are | was |
|---|---|---|---|
| 1 | **Drift Net** | the invader — a connected body that grows by taking worlds | Live Wire |
| 2 | **Flak Battery** | planetary anti-air as the fleet descends | Serpent Battery |
| 3 | **Choke Point** | ground defence once they have landed | Circuit Breaker |
| 4 | **Hull Breach** | the counter-attack against their hull | Angle Iron |

The fiction was chosen to fit mechanics that already existed rather than the other way round: Drift Net already grows and wins by covering the board, Flak Battery already faces a descending chain, Choke Point already funnels a column toward a core you defend, and Hull Breach was already a sphere against rectangular plates. Two existing mechanics gained a meaning for free — killing Flak Battery's head ending the formation is now a command ship, and Choke Point's Patch is a repair drone.

**The invaders are never named.** Colder, and it avoids the collection sounding like it wants to be a franchise.

**Story is told in one line per game** — on the cabinet card and at the top of the help panel, via `makeHelp({ lore })`. No cutscenes; a player can ignore all of it. The cabinet also orders the cards by the story rather than by build date, and marks each "1 / 4".

**Game IDs and directories were renamed too**, at the owner's request, knowingly discarding all personal bests and saved runs — there is one player and he didn't mind. If that ever changes, note that `shared/scores.js` and `shared/resume.js` both key off the game id, and the cabinet derives that id from a CSS class, so a future rename needs a real migration with a fallback read of the old key.

**The visual half landed in v20**, once the v17 trait cues were confirmed readable on device. Invaders are cubes, defenders are spheres, absolutely — Drift Net is a chain of cubes on a tether, Flak Battery a column of square craft, Choke Point square ground units against round emplacements. Hull Breach needed no change: its ball was already a sphere, and its bricks stay rectangular *plates* because they are hull armour rather than craft.

**Still to do:** the glow pass for Flak Battery and Hull Breach. Both have the right shapes now but are still on the old flat fills, so they look out of step with Drift Net and Choke Point.

## Open decisions (not yet settled)

- ~~Flak Battery's aim rework is untested on a device~~ — **settled 2026-07-29.** Confirmed good on a real phone. `AIM_ASSIST_R` (9) and `TRAVERSE_MAX` (5.6) stand; treat them as tuned unless something later disagrees.
- **Choke Point difficulty was not tuned**, deliberately: `wavePlan`/`hpScale`/`START_CHARGE` are untouched. But the smaller grid shortened the path (41 → 31 cells of travel) and cut the number of build sites, which raises difficulty on its own. Play it before turning any economy dial, or the two changes will be impossible to tell apart.
- Whether portrait-only becomes a real deletion, or the flag stays. Don't delete until it's had device time.
- Choke Point has still never been checked on a real device.
- ~~Hull Breach has no powerups~~ — **done 2026-07-27** (see below). Laser is deliberately still out.
- Choke Point towers are **hitscan** (instant zap). Projectiles (travelling shots) were deferred — a visual/feel upgrade, not a mechanics one.
- ~~No render smoke test for Hull Breach, Drift Net, or Choke Point~~ — **done 2026-07-29.** All four games now have one, sharing `tools/inline.mjs` (recursive module inlining) and `tools/render-harness.mjs` (jsdom + node-canvas boot). 19 render tests. Building this immediately found a live bug: the standalone build had been throwing at boot since v9, because the old hand-written inliner deleted `help.js`'s new nested import of `version.js`.
- ~~"Continue where you left off"~~ — **done 2026-07-29** for Choke Point, Flak Battery and Hull Breach. `shared/resume.js` (storage, build-stamping, defensive reads) plus engine-side `snapshot()`/`hydrate()` in each. **Drift Net is deliberately excluded**: it is one-life score-attack, where resuming a run is contrary to the genre.
  - Saves are guarded on a shell-level `started` flag, **not** `world.running` — the states most worth saving (shop open, level cleared) are exactly the ones where the game is paused, and checking `running` there deleted the save instead of writing it.
  - Flak Battery: `assistR` is deliberately not stored (it describes the *device*, not the run, so a phone save must not carry touch aim-assist onto a desktop), in-flight shots and particles are dropped, and `reserveSegIds` pushes the id counter past restored ids — `battery.lastHitAt` is keyed by segment id, so a reused id would hand a new segment a stranger's convergence timing.
  - Hull Breach: bricks are stored as damage per cell and the paddle as a fraction of board width, so a save restores correctly onto the other board shape.
  - Saves are written when a wave ends and when the page is hidden — `visibilitychange` is the event that actually fires when a phone backgrounds an app; `beforeunload` is unreliable there.
  - A snapshot is stamped with `BUILD` and refused if it doesn't match. A snapshot is a picture of engine internals, so a later build can easily have changed what they mean; restoring across that boundary gives a subtly corrupt run, which is worse than losing the save.
  - `tower.aim` is deliberately *not* stored — it holds a live enemy object and JSON can't carry identity. Safe to drop only because `step` re-acquires every frame (see the barrel fix).

## How to update this file

At the end of a session: update "What's playable," move finished items out of "In progress," update "Immediate next step," and log any real decision in [docs/DECISIONS.md](docs/DECISIONS.md) — a one-line mention here is enough, put the actual reasoning there.
