# Feedline — architecture notes

The detailed design notes for `games/feedline/`, moved out of [CLAUDE.md](../../CLAUDE.md) so they load when you work on this game rather than on every session. CLAUDE.md keeps the rules that break things; this file has the reasoning and the model. Read it before changing the engine or the shell here. Past decisions are in [docs/DECISIONS.md](../../docs/DECISIONS.md).

- **[engine.js](engine.js)** — grid/tick model rather than continuous physics. The board is a 32×24 grid of 25px cells (800×600, same as Hull Breach, so the two could share a cabinet frame without rescaling), or `LAYOUT_TALL`'s 18×34 in portrait, picked by the shell the same way Hull Breach does it.
  - **No pace rescaling, unlike Hull Breach** — the tick rate is seconds *per cell*, so reaction time per move is already board-independent. A portrait grid is just a slightly shorter game to fill. There's a test asserting both layouts tick at the same rate.
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
