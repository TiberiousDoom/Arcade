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

1. **Missile Command** — continuous physics like Flak Battery, defend-the-base
   theme that fits the setting. The obvious first.
2. **Invaders** — a formation of cubes, a sphere at the bottom. Closest to the
   art rules already written.
3. **Tetris** — grid/tick like Feedline (the engine owns the clock). Touch
   control is the real design problem: tap to rotate, drag to move, flick down
   to drop all compete for one finger.

**Open questions for the owner:**

- **Names.** Every game here has its own name rather than the classic's (Hull
  Breach, Feedline). Pick names, or have them proposed?
- **Gating.** `shared/unlocks.js` chains each cabinet from one ungated opener
  (Feedline opens Hull Breach). Where do three new games go in that chain?
- **Mid-run saves.** Feedline is excluded as one-life score-attack. Missile
  Command and Invaders run in waves and fit `shared/resume.js`; Tetris is
  score-attack like Feedline. Same split?
- **Tetris and the trademark.** The name, and closely copying the look, are
  protected; the falling-block mechanic is not. Worth deciding the name and the
  piece art with that in mind before the store listing does it for you.
