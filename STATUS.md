# STATUS

Last updated: 2026-08-05 (v27 — two economies rebuilt: per-emplacement guns, self-levelling towers)

## Read this first

This is the "pick back up" file — check here before touching code. See [CLAUDE.md](CLAUDE.md) for architecture (and for how this file is meant to be maintained), and [docs/DECISIONS.md](docs/DECISIONS.md) for why past choices were made.

## What's playable

Serve the repo first — the shells use ES modules, so `file://` won't work:
`python -m http.server 8123`, then open `http://localhost:8123/`.

- **The cabinet** ([index.html](index.html)) — the front door, listing all four games. Each game links back to it.

- **Flak Battery** ([games/flak-battery/flak-battery.html](games/flak-battery/flak-battery.html)) — playable, backed by a tested engine ([engine.js](games/flak-battery/engine.js) / [engine.test.js](games/flak-battery/engine.test.js)). No standalone build any more — it was retired in v26 (see below); the render test boots the real shell in memory like every other game.
- **Hull Breach** ([games/hull-breach/hull-breach.html](games/hull-breach/hull-breach.html)) — playable and complete: paddle-angle steering, armoured back rows, four rotating level patterns, lives, level-clear bonus.  Verified end to end in a browser (play, ball loss, game over, restart, level advance).
- **Feedline** ([games/feedline/feedline.html](games/feedline/feedline.html)) — playable and complete: buffered turning, deferred growth, expiring gold bonus, speed ramp, board-full win. Arrows/WASD plus swipe.  Verified in a browser (steering, reversal blocking, eating, wall death, banner, restart, bonus render).
- **Choke Point** ([games/choke-point/choke-point.html](games/choke-point/choke-point.html)) — playable and complete: grid tower-defense, three tower types (node/breaker/coil) that level themselves from combat XP, a persistent per-class armoury, easy/medium/hard, escalating endless waves, components economy, core integrity, per-tower targeting priority, lossless rotation. Tap to build.  Verified in a browser (build/economy, wave spawn+clear, kills, leaks→game over, score persistence, transpose rotation + pause, upgrade popup, audio mute).

**414 logic tests pass** (`node --test games/*/engine.test.js shared/*.test.js`) — Flak Battery 218, Hull Breach 78, Choke Point 72, Feedline 44, shared 2 — plus **41 render and resume tests** (`node --test games/*/render-test.mjs games/*/resume-test.mjs`, after `npm install --no-save jsdom canvas`).

## In progress / just decided

- Built Feedline under `games/feedline/` (originally `games/drift-net/`) — first grid/tick game, and the one that showed the engine/shell *seam* is legitimately per-game (Feedline's engine owns its tick clock; Hull Breach's takes no input at all). The pure-logic principle is what's shared, not the `step` signature.
- Built Hull Breach fresh under `games/hull-breach/` on the engine/shell split — second game in the layout, and confirmation the pattern works for something other than Flak Battery.
- Scrapped the old `arcade_games.html` (monolithic five-game cabinet). It was pulled from a larger personal site — depended on missing nav/theme chrome (`index.html`, `tracker.html`, `shared/theme.css`) and a live high-score backend (secret `SCRIPT_URL`/`API_TOKEN`) we don't have — and used the one-big-file structure we've decided against. See [docs/DECISIONS.md](docs/DECISIONS.md).
- **`shared/` extracted** — `theme.css`, `fit.js`, `fx.js`, with all three shells rewired and verified in a browser. Two things were deliberately left unshared (banner logic, engine `step()` signatures) — see shared/README.md.
- **The PWA layer is in** — `manifest.webmanifest`, `sw.js`, `shared/pwa.js`, and a generated icon set. Verified offline by stopping the server: pages load, fonts render, games play, and an uncached URL falls back to the cabinet.
- **The cabinet exists** — `index.html` ties the three games together, so this is an app rather than three loose pages. Plain links, no router, no framework.
- **Portrait layouts** added to Hull Breach and Feedline, so all three games are phone-shaped. Verified at a 375x812 viewport: Hull Breach uses 88% of viewport height, Feedline 83%, and a drag in Hull Breach's thumb band steers the paddle without covering the court.
- **Fonts are self-hosted** from `shared/fonts/`; nothing loads from the Google Fonts CDN any more, which was the last thing standing between the games and working offline.
- ~~**Flak Battery's missing `build.mjs` now exists**~~ — superseded. The standalone build and its generator were **retired in v26**: the artifact had to be regenerated after every change and a stale one meant the render test was checking old code, for no benefit since nothing distributed the file. All four render tests now inline the real shell in memory via `tools/inline.mjs`.
- Fixed a pre-existing Windows bug in `render-test.mjs` (it used `URL.pathname`, which yields `/C:/...` with percent-encoded spaces). The render test had evidently never run on this machine; it passes now.
- Long-term stretch goal: ship as a phone app. Plan is PWA first (installable, offline, cheap, no rewrite needed); native wrapping (e.g. Capacitor) only if app-store distribution becomes a real need later.

## Immediate next step

**The road to a shippable phone app, in agreed order** (see DECISIONS.md for why this sequence):

1. ~~**Extract `shared/`**~~ — **done.** `shared/theme.css`, `shared/fit.js`, `shared/fx.js`, all three shells rewired. See [shared/README.md](shared/README.md).
2. ~~**Self-host the fonts**~~ — **done.** `shared/fonts/` holds Chivo Mono (variable 300–700) and Archivo Black, latin subset, both OFL-1.1 with licenses shipped. Verified: the served games now make **zero** external requests, and the standalone makes zero subresource requests of any kind.
3. ~~**Portrait layouts for Hull Breach and Feedline**~~ — **done.** Both have `LAYOUT_TALL`, picked at load by aspect ratio. Hull Breach gained a `FLOOR`/`THUMB` split and height-scaled ball speed; Feedline needed neither (per-cell pacing). Safe-area insets added to `shared/theme.css`. All three games now handle portrait.
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
- Feedline's swipe threshold swallowed deliberate flicks (24px → 10px).
- Flak Battery's aim needed ~500px of drag to cross its arc, more than a phone is wide → gain roughly doubled, now ~245px.
- Instructions overflowed the banner and were written for mouse and keyboard → moved behind a `?` button per game, rewritten for tap and swipe.

## Device feedback, round two (acted on)

- Instructions were still too detailed → cut to three short lines plus two notes per game.
- Flak Battery's map appeared to reverse on rotate → its portrait board had ten rows against landscape's seven, and the path serpentines, so the same path fraction landed in a row running the opposite way. Row counts now match (7 both ways); the extra portrait height goes into row spacing.
- Feedline did not feel like it kept your place → the grids are now exact **transposes** (32x18 / 18x32), so rotation transposes every cell and is lossless. Turning the phone turns the board.
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

## Art direction: vector/CRT, piloted on Feedline (2026-07-30)

Decided against sprites and for an emissive vector look built in Canvas 2D — see `docs/crt-demo.html` (live at `/Arcade/docs/crt-demo.html`) for the four techniques compared, and DECISIONS.md for why.

`shared/glow.js` holds the primitives: `glowStroke` (multi-pass emissive stroke — everything else builds on it), `glowDot`, `inkDot`, `extrude`/`extrudeDisc`/`extrudeRect`, `fadeFrame`, `scanlines`. All reduced-motion aware.

**Feedline is the pilot.** Its wire is now one continuous glowing polyline rather than per-cell shapes — truer to the name, and four stroke passes for the whole body instead of eight per cell, which on a long wire is the difference between a handful of draws a frame and several hundred.

`tools/screenshot.mjs` renders a real frame to a PNG through the render harness. Art cannot be judged from a headless browser at all — rAF is throttled until the page stops compositing, so screenshots come back blank.

**Choke Point is done too** (taken out of order, at request). It gets the glow and the extrusion but **no phosphor trails** — a TD needs precise, unsmeared positions, and trails would fight the trait cues. Enemy bodies stay fully solid with halos outside them; the trait cues stay hard-edged and unglowed.

**Remaining:** Flak Battery and Hull Breach. Neither game is yet seen on a real device.

## The setting (decided 2026-07-30)

The four games are one story, and were renamed to match it. **You play the invasion first, then defend against it twice, then answer it.**

| # | game | you are | was |
|---|---|---|---|
| 1 | **Feedline** | the invader — a connected body that grows by taking worlds | Live Wire |
| 2 | **Flak Battery** | planetary anti-air as the fleet descends | Serpent Battery |
| 3 | **Choke Point** | ground defence once they have landed | Circuit Breaker |
| 4 | **Hull Breach** | the counter-attack against their hull | Angle Iron |

The fiction was chosen to fit mechanics that already existed rather than the other way round: Feedline already grows and wins by covering the board, Flak Battery already faces a descending chain, Choke Point already funnels a column toward a core you defend, and Hull Breach was already a sphere against rectangular plates. Two existing mechanics gained a meaning for free — killing Flak Battery's head ending the formation is now a command ship, and Choke Point's Patch is a repair drone.

**The invaders are never named.** Colder, and it avoids the collection sounding like it wants to be a franchise.

**Story is told in one line per game** — on the cabinet card and at the top of the help panel, via `makeHelp({ lore })`. No cutscenes; a player can ignore all of it. The cabinet also orders the cards by the story rather than by build date, and marks each "1 / 4".

**Game IDs and directories were renamed too**, at the owner's request, knowingly discarding all personal bests and saved runs — there is one player and he didn't mind. If that ever changes, note that `shared/scores.js` and `shared/resume.js` both key off the game id, and the cabinet derives that id from a CSS class, so a future rename needs a real migration with a fallback read of the old key.

**The visual half landed in v20**, once the v17 trait cues were confirmed readable on device. Invaders are cubes, defenders are spheres, absolutely — Feedline is a chain of cubes on a tether, Flak Battery a column of square craft, Choke Point square ground units against round emplacements. Hull Breach needed no change: its ball was already a sphere, and its bricks stay rectangular *plates* because they are hull armour rather than craft.

**The art direction is complete across all four games** as of v22. Flak Battery is a column of lit cube craft with glowing spherical ordnance; Hull Breach is lit hull plating with a trailing interceptor. Neither takes phosphor trails — both boards are mostly static, and static content accumulates under a fade; Hull Breach trails only the ball instead, tracked in the shell.

## Device feedback, round four — v22 checklist (acted on 2026-07-31)

46/47 checklist items passed; the free-text notes drove a full pass across all four games plus `shared/`. See [docs/DECISIONS.md](docs/DECISIONS.md) for the reasoning behind the notable calls.

- **A pause button now exists app-wide.** `shared/pause.js`, mounted next to the "?" help button in all four shells, gates each shell's `E.step(...)` call. First player-triggered pause the app has ever had.
- **The header-climb bug is fixed.** `shared/fit.js` only re-fit on `resize`/`orientationchange`/`visualViewport resize` — missing `visualViewport`'s `scroll` event, which is what iOS Safari's collapsing address bar actually fires. Now listened for too.
- **Choke Point rework:** bounties cut ~35%, per-type upgrade specialization (Node → fire rate, Breaker → range, Coil → splash), Patch's heal unlock pulled from wave 11 to 8 with a bigger radius/rate, a range ring now shows on an already-built tower's popup (not just placement preview), drag-and-drop placement alongside tap-to-build, and a new "Rush Wave" button that pulls the active wave's remaining spawns in immediately.
- **Flak Battery:** fixed the wave-15+ chop — `stepShots` was doing an O(shots × segments) scan with an uncached path lookup per pair every frame; segment positions are now cached per chain per frame (invalidated on any mid-frame splice). Also: chain length ramps steeper (cap reached by wave 7, not 11), scrap trimmed ~25-30% and mount costs raised (all 5 emplacements no longer affordable by wave 7), HP text bumped to 11px with an outline, the head's ring replaced with four corner brackets (less "target reticle"), and "DECAPITATED" reworded to "COMMAND SHIP DOWN" to match the command-ship framing.
- **Hull Breach:** brick damage now reads in discrete brightness bands instead of a continuous alpha fade, capsule glyphs bumped to 16px with a stroke outline, `MAX_BALLS` cut from 6 to 4 (six independent balls was chaos, not fun), and level 1 — previously the one layout with *no gaps* (a solid wall) — swapped for the checkerboard pattern so the opener isn't the hardest shape in the rotation.
- **Feedline's lore line** dropped its "you" framing per note: now "Every world it touched became a part of it, and it does not stop."
- **Landscape support was already fully removed** in a prior session (`PORTRAIT_ONLY = true` in all four shells, manifest already `"orientation": "portrait"`) — nothing left to do there beyond the still-open question of deleting the now-dead `LAYOUT` (landscape) objects, which stays deliberately deferred (see DECISIONS.md 2026-07-27).

**Deliberately not built that pass, and now done (v24, 2026-08-01):**

- **Hull Breach: salvage currency + a ball/paddle shop.** `brickSalvage(maxhp)` earns a new `w.salvage` per brick, separate from score — same split Flak Battery uses. Three branches (`paddle`/`steer`/`catch`, 3 tiers each, `UPGRADES`/`upgradeCost`/`canAfford`/`buyUpgrade`/`stats(w)`, identical shape to Flak Battery's tree) widen the paddle, widen the steering cone (`PADDLE_MAX_ANGLE` multiplier), and widen the capsule catch radius — deliberately nothing touches ball speed, which stays `levelSpeed`'s sole authority. A `#shop` panel (copied from Flak Battery's) opens on every level clear instead of the old plain "Level Cleared" banner. **Caveat:** `paddle.w` is a cached field, recomputed only at level/effect transitions (same as the existing `wide` effect) — buying in the shop takes visible effect once `nextLevel` runs right after, not instantaneously.
- **Hull Breach: level-select.** New `shared/levels.js` (`maxLevel`/`recordLevel`, same guarded-localStorage shape as `shared/scores.js`) tracks the highest level ever reached, no fixed cap — the grid just grows, matching `brickPresent`'s actually-infinite generation. A new `#levelSelect` overlay (card-grid CSS borrowed from `index.html`) lists every level 1..max; tapping one calls `clearRun` first (so a stale resumable save can't linger) then jumps straight in. Entry point is a "Levels" button on the banner.
- **Flak Battery: ion cannon vs. a hardened hull.** A 4th `GUN_TYPES.ion` entry, and a new `KIND.hardened` carrying `ionResist: 0.12` — a flat damage multiplier for anything but the ion cannon, checked in `damageSeg` against a new `shot.gun` field (`fireGun` now stamps every shot with which mount fired it). Deliberately **heavily resistant, not immune** (12% damage still gets through), and deliberately independent of `shielded`'s frontal-arc deflection (`isDeflected`) — `hardened` has no `shield` flag, so flanking does nothing for it; only the gun matters, not the angle. Visual cue is an all-around lattice ward (vs. `shielded`'s one-sided plate), and ion shots get their own cyan tint instead of the shared overdrive color every other gun's shots use.

All three followed an existing pattern rather than inventing new architecture (Flak Battery's upgrade-tree shape, `scores.js`'s guarded-localStorage shape, `shielded`'s KIND-flag-plus-damageSeg-branch shape). 34 new engine tests; full suite is now 385 (352 engine/shared + 33 render/resume). Manually verified in-browser: level-select grid grows and jumps correctly, and the real shipped engine (not just the standalone test copy) confirms a standard-cannon hit on a hardened craft is resisted while an ion-cannon hit isn't.

## Round 3 feedback — economy, art, UI consolidation, rename (v25, 2026-08-02)

- **One settings menu, everywhere.** `shared/pause.js`, `shared/help.js`, and `shared/audio.js`'s `mountAudioToggle` — three separate always-visible corner buttons overlapping the board — are gone, replaced by one `shared/menu.js` (`makeMenu`). Opening it pauses the run (same `{paused, pause(), resume(), toggle()}` contract as the old `pause.js`), and the panel holds mute, controls reference, and (Hull Breach only, via `onLevels`) a Levels entry. `pause.js`/`help.js` are deleted; `audio.js` keeps `makeAudio()`, just not the button.
- **Header safe-area was only half-fixed.** `shared/theme.css`'s `body` padding covered bottom/left/right insets but never `top` — added `env(safe-area-inset-top)` at the base rule and both media-query overrides.
- **Choke Point:** Breaker now has its own steeper upgrade-cost curve (separate `upgradeBase`/`upgradeStep` per tower type) so it stops crowding out Node once charge piles up; bounties cut again; `rushWave` is now a gradual fast-forward (compresses remaining gaps, doesn't dump the wave at once); `startWave` now works **mid-wave**, overlapping wave N+1 onto wave N rather than refusing — a real behavior change, the old "cannot start mid-wave" test was rewritten to assert the new overlap instead. Enemy art now uses the same dark-body/lit-rim/offset-back treatment as the towers (`extrudeRect`), dropping the per-trait glyphs (armor border, splash-resist dash, slow-immune chevron, heals cross) — colour and size carry the distinction now. Tower tier pips shifted down-left to clear the body. Road art: dropped the dashed centerline, widened and brightened the edge glow, darkened the channel further.
- **Flak Battery:** scrap and upgrade/mount costs cut further; base hp and the wave-length ramp both steepened (a zero-upgrade run was reaching wave 10+ unaided); `recoilGain`'s blowback softened (~40% less at the worst case). **Ion cannon reworked**: it now bypasses `shielded`'s frontal-arc deflection (hits from any angle) instead of resisting `hardened`'s damage; `hardened` is a plain tough kind again, and the railgun gets a damage bonus against it instead. New **multi-barrel** upgrade (`buyBarrel`/`barrelCost`, battery-wide, up to 3) — each mount fires that many rounds per volley off one shared heat pool. Fixed a real bug: shot colour used to be read live off the battery's current overdrive tier every frame, so a shot fired while cool would flip red mid-flight the instant the streak climbed — colour (and gun-type) is now baked onto the shot at fire time. Segments, the road, and the gun/barrel art all scaled up (draw-size only; collision radii untouched).
- **Drift Net → Feedline.** Full rename (directory, file names, game id, manifest/cabinet/docs), following the existing 2-prior-renames precedent — discards the old personal-best under `drift-net`, same as before. Gained a settings section in its menu: a swipe-sensitivity slider and a swipe/virtual-d-pad input-mode choice, both stored in localStorage; keyboard keeps working regardless of mode.
- **Hull Breach:** fixed the level-select stacking bug (`#levelSelect` now `z-index:8`, so the opening banner can never paint over it) and wired it into the new menu (`onLevels`) so it's reachable mid-run, not just from the opening banner.

**Noted for next time, not acted on:** the Flak Battery standalone build (`flak-battery-standalone.html`, `build.mjs`) was an early single-file test artifact — per the owner, it no longer needs to be maintained and can be retired (delete the file, `build.mjs`, its precache-exclusion note in `sw.js`, and repoint `render-test.mjs`/`resume-test.mjs` at `flak-battery.html` directly, matching the other three games' render-test pattern).

## Round 5 feedback — two economies rebuilt (v27, 2026-08-05)

The largest round so far, and mostly not tuning: **Flak Battery's shop and Choke Point's upgrade system were both replaced**, not adjusted.

**Choke Point — towers level themselves, money buys the class.** The manual three-tier upgrade is gone. Towers carry `xp`/`level` (1–10) and level from damage that actually lands, capped at the target's remaining health plus a small kill bonus — otherwise a Breaker parked over the spawn levels on overkill. What scrap buys is a per-class **armoury** (damage / fire rate / range / splash), and it **persists across runs** in localStorage. Each class buys its speciality cheap and its opposite dear (Node rate/splash, Breaker splash/rate, Coil range/damage), which is what stops the three converging on the same build.

Since the armoury only grows, **difficulty** (easy/medium/hard) is the counterweight, scaling enemy health and the opening purse in opposite directions, and it rides along with the score so a Hard wave 14 is not filed against an Easy one. `charge` became **components**; the save reads both names so a v26 run in progress resumes with its money.

Two stated requirements are pinned by tests rather than left to drift: a **level-10 Breaker reaches exactly three cells**, and one with the range track maxed reaches exactly **four**.

**The side gutters are gone, and v26's fix never worked.** Measured at 375×812, the board cleared the stage width by *three pixels* — on a desktop browser, where `env(safe-area-inset-*)` reads as 0. A real phone spends 44–59px on the notch and ~34px on the home indicator, and every one of those came off the board's **width**: 63px of gutter per side, measured. `fit.js` gained a `fillWidth` mode (spend the full width, let the page scroll if the furniture no longer fits) plus a compact palette below 560px. Gutter is now 2px at every inset level tested, and the board on a notched 375px phone went 296px → 357px wide. Grid, `CELL` and routes all untouched.

**Rush Wave is back.** v26 deleted it assuming fast-forward covered it. It does not: fast-forward speeds up *time*, so towers fire proportionally faster and the wave is merely shorter; rush speeds up the *enemy* alone. One is a convenience, the other a gamble taken for the bounty.

**Flak Battery — upgrades per emplacement.** `stats(w)` became `stats(w, gun)` and every caller must now say which mount it means. One tab per emplacement in the shop, each with its own four branches, its own retrofit row, and a **large drawing of the gun actually fitted there** — five of them, one per type. Prices deliberately unchanged: a new mount arrives bare, so a fifth gun competes against deepening the four you have.

**The mortar lobs.** `arc: true` had been set on every mortar round since the gun shipped and was read by *nothing*, so the blurb described behaviour that did not exist. Rounds now carry a travelled distance and cannot hit anything inside `MORTAR_ARM`.

**Extra barrels fire parallel**, laterally offset rather than angularly fanned, with smaller and weaker flanking rounds. Both the portrait and the mount art read the offsets from the engine so the picture cannot drift from the geometry.

**A breach opens the shop**, retrying the same wave rather than throwing it straight back — you had just earned scrap and no way to spend it. Blowback is about a third of what it was.

**The wave-7 cliff** was `waveCount` hitting its 78-craft ceiling at exactly wave 7. Multi-column waves were tried and rejected (see DECISIONS); the climb comes from `hpScale`, 26% steeper at wave 14 and still rising where v26 flatlined.

**Touch aiming splits on the breach line**: relative drag below it, point-at-your-finger above it, still through `slewAim` so the turret swings rather than teleporting.

**Sound works again.** `menu.js` resumed audio on a `{ once: true }` listener, so the first time iOS suspended the context — a call, a lock, backgrounding the PWA — nothing was left to wake it and the session stayed silent. And `fire()` was the quietest entry in the library by half.

**Hull Breach** gained an expensive single-step **Pierce** branch: the ball carries through a brick it destroys, but still bounces off one that survives.

### Still open after this round

- The armoury has had no device play yet. The costs (`CLASS_BASE_COST`, `SPEC_DISCOUNT`/`WEAK_PENALTY`) and the XP curve (`xpForNext`) are first drafts and will want a pass once there is a feel for how fast a class actually climbs.
- Flak Battery's per-emplacement economy is untuned on purpose — the five-fold bill *is* the balance, but nobody has yet played a run deep enough to say whether a wide-and-shallow battery is genuinely competitive with a narrow-and-deep one.
- `fillWidth` is Choke Point only. If another game ever wants it, the `body.scrolls` pairing is the part to remember.

## Round 4 feedback — art, difficulty, gating, UI placement (v26, 2026-08-04)

Everything in the two queued lists below was acted on. Notable outcomes:

- **The Flak Battery standalone is retired.** `flak-battery-standalone.html` and `build.mjs` are gone; its render test now boots the real shell in memory via `tools/inline.mjs`, like the other three. It even gained a boot test it never had.
- **Menu button moved into the header**, absolutely positioned rather than as a flex child — as a third child it wrapped onto its own row and added ~50px of header height on every game. `header` gets `position:relative` + `padding-right` to reserve its column.
- **The real "header too high" cause was a flexbox trap**, not padding: `body` was `align-items:center`, and a centred flex item taller than its container overflows *both* ways, so `overflow:hidden` clipped the top off-screen. Now `flex-start`.
- **`fit.js` stopped guessing.** `GAP_AND_PADDING = 34` didn't track the ≤560px media query or safe-area insets; it now measures body padding, every shell child that isn't the board, and the flex gaps. Choke Point's `extra` was removed as a consequence — its controls strip is a shell child and was being counted twice.
- **Choke Point's "dead space either side" needed no route redraw.** The board was height-constrained because three stacked full-width wave buttons ate 225px (28% of the screen). Putting Start / FF / Auto in one row cut that to 165px and the board now fills the full stage width (gutter 0; canvas 357×535, up from 318×478). The 12×8 grid and all three routes are untouched.
- **Rush Wave became two controls**, per your correction: a **1×/2×/4× fast-forward** (the shell calls `step` N times per frame — a 4× `dt` would overshoot the sub-step sizes the collision and spawn code assume) and an **Auto** toggle that starts the next wave when one clears. `rushWave`/`RUSH_COMPRESSION` are deleted.
- **Health is brightness now, in both games.** Flak Battery's hp numbers and Choke Point's hp bars are gone; a damaged thing dims instead, via a new shared `dim()` in `glow.js` (needed because `cube`/`extrudeRect` take colours but no intensity argument the way `glowStroke` does).
- **The "more 3D" cue was the joining edges.** Choke Point's enemies moved to `cube()`; Flak Battery's oblong craft kept their hand-rolled path but gained the same corner-linking strokes. Both also had their body fill lifted off near-black — the same lesson already recorded for Choke Point's towers, which read as hollow rings until the body was lifted.
- **Flak Battery's spacing had to grow with the craft.** At `long = r*2.8` against spacing 30 the plates were wider than the gap and a chain fused into one continuous fence. `SEGMENT_SPACING` is now 42 with square craft at `r*2.7`. That spacing is also what caps chain length: 78 craft × 42 ≈ 3276px of a 4374px portrait path (~75%), so further difficulty should come from `hpScale`, which has no geometric ceiling.
- **Power-up drops are off by default**, behind `createWorld({ drops })` and a settings-menu toggle. Excluded from snapshots for the same reason `assistR` is — it describes the player's setting, not the run.
- **New Choke Point `tank`**: halts on a timer to deploy Swarm mid-path, and spills half a batch again where it dies. Needed `spawnEnemy` to take a `dist` (it always started at 0).
- **First-play-through gating** via new `shared/unlocks.js` — cabinet-only by your call, so deep links and PWA shortcuts still work and the manifest is untouched.

## The queued lists these came from (2026-08-03 / 2026-08-04)

**Choke Point:**
- Start Wave and Rush Wave side by side (currently stacked full-width) — and Rush Wave should be a continuous fast-forward (e.g. hold-to-compress) rather than a per-tap compression.
- Some tower-palette buttons can be selected even when not actually available (e.g. unaffordable) — check the selection logic, not just the `disabled` styling.
- Make the game board bigger.
- Make the enemy squares look more 3D.
- Drop the hp bar above each enemy; dim the square as its health falls instead.
- New **tank** enemy: periodically stops and deploys Swarm, and deploys half the usual amount again when destroyed.
- After wave 5 the difficulty should ramp sooner.

**Flak Battery:**
- Enlarge the squares and the path (again — v25 scaled them up once).
- Scale the shop cards back down.
- Remove the "FOCUS" floater on a convergence kill.
- Reduce the size of the bigger projectiles.
- Turn power-up drops **off** — an experiment to see how the game plays without them, so keep it a flag rather than a deletion.
- Make the squares look more 3D.
- Drop the hp number on tough segments; dim the square as its health falls instead (same cue as Choke Point above).
- The command ship should read as a command ship, not as a head.
- Longer chains, and more health per square.

**Feedline:**
- Slow the opening speed down — too hard at the start.

**All games:**
- Move the menu button into the header (it currently floats as a corner button over the canvas).
- Header sits too high — revisit after the safe-area-inset-top fix from v25; may need a second look at spacing/positioning rather than just the inset.
- **Gate the games on a first play-through**: Flak Battery unlocks after losing once in Feedline; Choke Point after reaching wave 10 in Flak Battery; Hull Breach after wave 10 in Choke Point. First play-through only — once unlocked, they stay unlocked.

## Open decisions (not yet settled)

- ~~Flak Battery's aim rework is untested on a device~~ — **settled 2026-07-29.** Confirmed good on a real phone. `AIM_ASSIST_R` (9) and `TRAVERSE_MAX` (5.6) stand; treat them as tuned unless something later disagrees.
- **Choke Point difficulty was not tuned**, deliberately: `wavePlan`/`hpScale`/`START_CHARGE` are untouched. But the smaller grid shortened the path (41 → 31 cells of travel) and cut the number of build sites, which raises difficulty on its own. Play it before turning any economy dial, or the two changes will be impossible to tell apart.
- Whether portrait-only becomes a real deletion, or the flag stays. Don't delete until it's had device time.
- Choke Point has still never been checked on a real device.
- ~~Hull Breach has no powerups~~ — **done 2026-07-27** (see below). Laser is deliberately still out.
- Choke Point towers are **hitscan** (instant zap). Projectiles (travelling shots) were deferred — a visual/feel upgrade, not a mechanics one.
- ~~No render smoke test for Hull Breach, Feedline, or Choke Point~~ — **done 2026-07-29.** All four games now have one, sharing `tools/inline.mjs` (recursive module inlining) and `tools/render-harness.mjs` (jsdom + node-canvas boot). 19 render tests. Building this immediately found a live bug: the standalone build had been throwing at boot since v9, because the old hand-written inliner deleted `help.js`'s new nested import of `version.js`.
- ~~"Continue where you left off"~~ — **done 2026-07-29** for Choke Point, Flak Battery and Hull Breach. `shared/resume.js` (storage, build-stamping, defensive reads) plus engine-side `snapshot()`/`hydrate()` in each. **Feedline is deliberately excluded**: it is one-life score-attack, where resuming a run is contrary to the genre.
  - Saves are guarded on a shell-level `started` flag, **not** `world.running` — the states most worth saving (shop open, level cleared) are exactly the ones where the game is paused, and checking `running` there deleted the save instead of writing it.
  - Flak Battery: `assistR` is deliberately not stored (it describes the *device*, not the run, so a phone save must not carry touch aim-assist onto a desktop), in-flight shots and particles are dropped, and `reserveSegIds` pushes the id counter past restored ids — `battery.lastHitAt` is keyed by segment id, so a reused id would hand a new segment a stranger's convergence timing.
  - Hull Breach: bricks are stored as damage per cell and the paddle as a fraction of board width, so a save restores correctly onto the other board shape.
  - Saves are written when a wave ends and when the page is hidden — `visibilitychange` is the event that actually fires when a phone backgrounds an app; `beforeunload` is unreliable there.
  - A snapshot is stamped with `BUILD` and refused if it doesn't match. A snapshot is a picture of engine internals, so a later build can easily have changed what they mean; restoring across that boundary gives a subtly corrupt run, which is worse than losing the save.
  - `tower.aim` is deliberately *not* stored — it holds a live enemy object and JSON can't carry identity. Safe to drop only because `step` re-acquires every frame (see the barrel fix).

## How to update this file

At the end of a session: update "What's playable," move finished items out of "In progress," update "Immediate next step," and log any real decision in [docs/DECISIONS.md](docs/DECISIONS.md) — a one-line mention here is enough, put the actual reasoning there.
