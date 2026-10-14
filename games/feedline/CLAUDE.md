# Feedline — architecture notes

The detailed design notes for `games/feedline/`, moved out of the root [CLAUDE.md](../../CLAUDE.md) so they load when you work in this directory rather than on every session (Claude Code picks up a `CLAUDE.md` in the directory it is working in). The root file keeps the rules that break things; this file has the reasoning and the model. Read it before changing the engine or the shell here. Past decisions are in [docs/DECISIONS.md](../../docs/DECISIONS.md).

- **[engine.js](engine.js)** — grid/tick model rather than continuous physics. The board is an 18×32 grid of 25px cells (450×800), portrait only since v51 — the landscape grid, and the `relayout` that transposed a running wire between the two, are gone (DECISIONS 2026-10-14).
  - **No pace tied to the board** — the tick rate is seconds *per cell*, so reaction time per move does not depend on the grid's size.
  - **No thumb band either**: steering is a flick, not a hold, so a finger is never parked over the board.
- **The engine owns the tick clock.** `step(w, dt)` accumulates time and fires as many ticks as have come due; `tick(w)` is exported separately so tests can drive exact discrete steps. Pace lives in the engine because *pace is the difficulty curve here* (`tickRate` shortens with every meal) — it's a game rule, not a rendering concern. This is the opposite call from Hull Breach, where the shell drives everything.
- Randomness is a seeded LCG (`rand`), same one Flak Battery uses. `createWorld({ seed })` makes food sequences reproducible — the shell seeds from the clock, tests pass a fixed seed.
- Model details worth knowing before editing:
  - `w.wire` is an array of cells, **head at index 0**. Growth is deferred via a `w.grow` counter rather than appending immediately, so a meal lengthens the wire over the next few ticks.
  - **The tail-vacating rule**: the cell the tail is leaving is legal to move into, so chasing your own tail isn't a death. But a wire mid-growth (`w.grow > 0`) keeps its tail put, so that cell *is* solid. Both cases are tested; don't "simplify" the collision check into a plain body scan.
  - `turn()` buffers up to `MAX_QUEUE` (2) direction changes and validates each against the **last queued** direction, not the current one — otherwise a fast up-then-left jink inside one tick would be wrongly rejected as a reversal.
  - Filling the board is a **win** (`w.won`), reached when `spawnFood` finds no free cell. One life, no levels — the genre convention.
  - `tickProgress(w)` exists purely so the shell can interpolate the head sliding out of its previous cell and the tail retracting; derived from engine state so the animation can't drift from the simulation.
- **[feedline.html](feedline.html)** adds swipe input (dominant-axis flick) alongside arrows/WASD — the first touch control in the repo, since Feedline is unplayable on a phone without it.
- **[engine.test.js](engine.test.js)** — board/setup → determinism → movement → turning → eating/growth → bonus → death → time accumulator → win → reset → full-run invariants (no duplicated cells, body stays contiguous).
