# Pre-release plan — the work before a store release

Decided 2026-10-14 (STATUS "Decisions waiting on the owner", answered): **hold
off on shipping** until the items below are done. Two of the owner's answers
shipped straight away in v50 (Flak Battery's Refit block hides locked guns;
Choke Point builds on release). This file is the rest. Delete it when the last
item ships, and move the reasoning to DECISIONS.

Build order, cheapest and most foundational first:

1. **Delete landscape** — first, because every later item (and all three new
   games) would otherwise be built for two layouts.
2. **Choke Point's gradual unlock** — a contained change to one game.
3. **Three new classics**: Missile Command, Invaders, then Tetris.

Every item touches files the app loads, so each ships as its own build with
the usual `CACHE_VERSION`/`BUILD` bump; new games also go into `PRECACHE`.

---

## 1. Delete landscape

The owner's call on the portrait-only flag (open since DECISIONS 2026-07-27):
delete landscape rather than keep the flag.

**Scope, measured 2026-10-14:** about 130 references across the four shells,
four engines and four test suites (`PORTRAIT_ONLY`, `LAYOUT_TALL`,
`pickLayout`, `relayout`, the transpose code), plus one rule in
`shared/theme.css`.

- Each engine keeps **one** layout. Rename `LAYOUT_TALL` to `LAYOUT` and drop
  the landscape constant, rather than keeping two names for one thing.
- `relayout` and the rotation handlers go from all four shells, along with
  Choke Point's lossless transpose (`relayout`, the `(c,r)→(r,c)` map) and
  Feedline's. Their tests go too — they test a feature that no longer exists.
  The **layout-independence tests** (Hull Breach's traversal time, Feedline's
  tick rate) also lose their reason; delete rather than keep them passing
  against one layout.
- Hull Breach's `FLOOR`/`THUMB` split stays: it is about the thumb, not the
  orientation.
- **What happens sideways in a browser tab.** The manifest lock only binds once
  installed; in a tab the phone can still turn. Today that gives a letterboxed
  portrait board. Keep exactly that — `makeFit` already letterboxes — and do not
  add a "rotate your phone" overlay, which blocks play for no gain.
- **Saves.** Hull Breach stores the paddle as a fraction of board width and
  bricks per cell, Choke Point stores towers by cell. A landscape save restored
  onto the only layout left must not put a tower on the path. Simplest: since
  the build bump already refuses old snapshots (`shared/resume.js` stamps
  `BUILD`), nothing extra is needed — confirm that with a resume test rather
  than assume it.
- Update the root CLAUDE.md (PWA layer line, Hull Breach/Feedline notes) and the
  per-game CLAUDE.md files, which describe two layouts throughout.

## 2. Choke Point's gradual unlock

The owner's answer: yes, apply Flak Battery's ramp. Flak Battery's shop opens
with three branches and widens on `experience(w)` — the best wave ever reached
— so a veteran restarting never re-earns anything (`BRANCH_UNLOCK`,
`openBranches`, `branchUnlocked`; DECISIONS 2026-08-19).

Choke Point already gates Sever (Medium win), Chain (Hard win) and Veterancy
(a sweep) on *wins*. What it does not gate is the first-run spread: three
classes, four armory tracks and a difficulty choice. A proposal to settle
before building:

- **Classes**: Node only on the very first run; Breaker at best wave 4 (first
  Swarm, where splash pays); Coil at best wave 9 (first Phase, where its slow
  matters). Sever stays on its Medium-win gate.
- **Armory tracks**: Damage and Rate first; Range and Splash once the armory has
  been opened after a run (i.e. once there is a second run).
- **Difficulty**: Easy is already the only open difficulty on a new save, so
  nothing to do.
- Same rules as the existing gates: carried on the progress object (best wave
  per save, never per run), projected onto the world by `syncUnlocks`, never
  snapshotted, refused by `buildTower`/`buyClassUpgrade` so the shell cannot
  sell a locked thing, and **drawn with the requirement on it**, never hidden.

**Open question for the owner:** are those wave numbers the right moments, or
should a class arrive one wave *before* the enemy it answers, so the player has
it in hand when that enemy turns up?

## 3. Three new classics

The owner's answer: all three, before release. The classics cabinet has two of
the five originals the scrapped `arcade_games.html` held (Breakout → Hull
Breach, Snake → Feedline).

Each is a new `games/<name>/` on the usual pattern: pure `engine.js` with a
test suite organized by subsystem, a shell using the shared modules (fit, fx,
glow, menu, prefs, tap, audio, scores), a render test, a per-game `CLAUDE.md`,
a card in `classics.html`, a manifest shortcut, `PRECACHE` entries, and art
that keeps the absolute: **invaders are cubes, defenders are spheres**.

Suggested order, by how much each reuses what exists:

1. **Missile Command (Airburst)** — continuous physics like Flak Battery, defend-the-base
   theme that fits the setting. The obvious first.
2. **Invaders (Shield Wall)** — a formation of cubes, a sphere at the bottom. Closest to the
   art rules already written.
3. **Tetris (Bulkhead)** — grid/tick like Feedline (the engine owns the clock). Touch
   control is the real design problem: tap to rotate, drag to move, flick down
   to drop all compete for one finger.

**Settled 2026-10-14: saves.** Missile Command and Invaders run in waves and get mid-run saves through `shared/resume.js`, with a resume test each. The falling-block game is one-life score-attack like Feedline: no save.

### Proposed names (owner to pick)

Every game here is named for its fiction in two plain words, not for the classic it echoes. Each name below is a common phrase, which helps the store listing and hurts trademark exclusivity in the same way; search the Play store for each before committing.

| Classic | Proposal | Why | Alternates |
|---|---|---|---|
| Missile Command | **Airburst** | Interceptors detonate in the air and the blast does the work — the name is the mechanic. | Last Light, Ground Zero |
| Space Invaders | **Shield Wall** | The bunkers you hide behind and watch erode are the part everyone remembers. | Firing Line, Holdfast |
| Tetris | **Bulkhead** | A hull is sealed one section at a time; a full row is a compartment closed. Sits next to Hull Breach. | Ballast, Dry Dock |

### Bulkhead's piece art — keeping clear of Tetris's look

The falling-block mechanic is free to use; Tetris's *look* is protected trade dress (Tetris Holding v. Xio, 2012, turned largely on the visual expression: the 10×20 well, one bright colour per piece, pieces drawn as bevelled square tiles). Not legal advice, but the safe design is the one that is different on every one of those points, and the house style already points there:

- **One outline per piece, not tiles.** Each piece is drawn as a single glowing contour around its whole shape (`glowStroke`), with no lines between its cells. A placed piece reads as a riveted hull plate, which is the fiction.
- **Colour means state, not shape.** Every piece is the game's accent colour. Colour changes only to say something: dim when locked in, bright when falling, hot (white) on a row about to clear. No seven-colour palette.
- **The well is not 10×20.** 11 wide × 22 tall fits a portrait phone at a similar aspect ratio, and is a different board. Play-test the width; 11 also changes how the long piece clears.
- **Clearing is welding**, not flashing: a seam of sparks runs along a full row before it goes. Uses the existing particle module (`shared/fx.js`).
- **The pieces are never called tetrominoes or tetriminos** (the second is a trademark) — they are plates.
- Plates are neither invaders nor defenders, so the cubes/spheres rule does not apply; no plate is drawn as a cube.

### Unlocking — a proposal

The rules already set: **one chain per cabinet, never across cabinets**, enforced on the cabinet only (direct links still open everything), recorded through `recordProgress`. Each gate should be a moment a new player reaches in one or two sittings, and ideally one that teaches something the next game uses.

**Recommended: extend the classics chain, one game at a time.**

| Game | Opens when | Teaches |
|---|---|---|
| Feedline | always (the opener) | steering on glass |
| Hull Breach | a Feedline run finished (as now) | angles |
| Airburst | Hull Breach level 3 cleared | leading a moving target |
| Shield Wall | Airburst wave 5 survived | holding a position under fire |
| Bulkhead | Shield Wall wave 5 survived | — the capstone; the one nobody needs teaching |

Hull Breach records no progress today, so it needs one `recordProgress(GAME_ID, level)` call where a level clears — small, and a version bump it would share with Airburst's arrival.

**Alternatives considered:**

- **Any N runs anywhere in the cabinet opens the next game.** Kinder to someone who only likes one game, but a gate you can pass by losing quickly teaches nothing.
- **Airburst and Shield Wall in the invasion cabinet instead.** Both are defend-the-planet games and would fit the invasion story as chapters (descending missiles, a descending formation), leaving the classics as Feedline, Hull Breach and Bulkhead. Worth deciding before Airburst's lore line is written — the classics cards carry no story, the invasion cards do.

**Still open for the owner:** names; the chain (or one of the alternatives); which cabinet Airburst and Shield Wall belong in.
