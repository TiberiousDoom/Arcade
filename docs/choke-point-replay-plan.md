# Choke Point: replay incentives — plan

Written after round 15 (v44), agreed in conversation, **not implemented**. This
file is the design and the open questions; it is the thing to pick up when the
next round of feedback lands. Real decisions move to [DECISIONS.md](DECISIONS.md)
as they are made, and this file is deleted once the work ships — same lifecycle
as [v28-plan.md](v28-plan.md).

## The problem it solves

Asked at round 15: *"There's currently no incentive to complete a circuit on
medium or hard difficulty."* True. Today the only consequence of a harder win is
that `recordWin` unlocks the next circuit **on that difficulty** — and by the
time anyone tries Medium they have usually already unlocked every circuit on
Easy, so the reward is one they already hold.

Four pieces, agreed in this order. Each is independently shippable; the gating
ladder at the bottom is what ties them together.

---

## 1. Sever — a fourth tower class, earned on Medium

A debuff tower. Low damage, but a hit **marks** the target: while marked it
cannot be healed, and it takes a damage multiplier from everything else.

```js
sever: {
  name: 'Sever', cost: 30, col: '#ff5fd0', blurb: 'Marks a target; everything else hits it harder',
  base: { range: 100, rate: 1.0, dmg: 3, splash: 16, slow: 0, slowDur: 0 },
  mark: 0.35, markDur: 3,
  spec: 'rate', weak: 'dmg',
}
```

**Why this and not a fourth damage dealer.** Two enemies deliberately sit
outside the current answer set: **Patch** (`heals: 12`) and **Phase**
(`splashResist: 0.8`, `slowImmune: true`). Both are answered today by "bring
more of what you already have". A mark is the one verb that lands on both — it
shuts Patch off without out-damaging the heal, and it is a status Phase cannot
shrug off, since it is not a slow.

**It composes with machinery that exists.** `SLOW_BRITTLE` already multiplies
incoming damage off a status; the mark is the same shape with a different
trigger. Expect `damageEnemy` to read `e.marked` next to `e.slow`, and
`stepEnemies` to tick it down like `e.slow`/`e.healed`.

**It cannot become strictly better than anything.** 3 damage a second kills
nothing. It makes the board you already built better, which is the right shape
for a thing earned *after* learning the board.

Notes for the implementer:

- **Colour.** `#ff5fd0` collides with no tower and no enemy — Phase's `#b58fd0`
  is far enough in hue and brightness. The palette test enforces this; run it
  rather than trusting this paragraph.
- **Every base stat must be non-zero** (`splash: 16` is there for exactly this
  reason). A zero base makes that armory track a silent no-op on this class,
  which has shipped twice already.
- **Patch's heal must actually be blocked** — `stepHealers` runs before the
  towers fire, so the mark check belongs inside the heal, not around it.
- Open: does a chained hit (see below) carry the mark to the second target?
  **Start with no.** Mark-plus-chain is a lot of compounding to tune blind and
  is trivial to switch on later.

**Shell cost.** A fourth `.pick` button: three fit one row on a phone at
`min-width: 92px`, a fourth wraps, and under `fillWidth` that height comes
straight off the board. Plan for a 2×2 palette grid on narrow screens rather
than a wrapping row. The armory also gains a **column** (`--cols`), so the
`max-width:400px` block needs retuning — four columns of 46px cells is tight.

---

## 2. Chain — a fifth armory track, earned on Hard

`CLASS_TRACKS` already holds four (`dmg`, `rate`, `range`, `splash`), so this is
the **fifth**, and the first that is not "more of a number you already have":
a shot **forks to a second target**.

**Deterministic, not a proc.** The original idea was a fraction of a percent
chance per buy. Two reasons it should be a counter instead:

- At ~2-3% maxed, a player fires hundreds of shots between forks, never
  attributes one to the purchase, and concludes the row does nothing. That is
  the exact failure the non-zero-base test exists to prevent, recreated
  deliberately.
- **Nothing in the simulation currently calls `rand`.** The LCG is exported and
  seeded, but wave plans are pure and spawns are scheduled — Choke Point is
  deterministic in practice. A per-shot roll would make a run irreproducible
  against any change to how many shots get fired, and would force every test
  about chaining to be written against a seeded stream instead of behaviour.

So: every Nth shot forks, on a per-tower counter.

| level | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| forks every | never | 6th | 5th | 4th | 3rd | 2nd |

This is also *fairer* than a percentage, which would hand Node roughly three
times the value of the identical purchase simply because it fires three times as
often.

**Why it is worth a row.** It is not splash: splash is `s.splash` pixels around
the impact (a fifth of a cell on Node), while a fork reaches the next enemy
within a much larger radius. On a strung-out lane splash does nothing and a fork
still works. And it differentiates per class for free — a chained **Coil** hit
applies the slow to the second target, which is a support multiplier, while a
chained **Breaker** hit is a second heavy blow.

Notes for the implementer:

- **For Breaker the fork resolves at detonation, not at the muzzle.** v43's rule
  is that nothing about a slug resolves until it arrives; a fork leaving the
  barrel would reintroduce precisely the bug that change fixed.
- Second target: nearest enemy to the *first target* within a chain radius,
  excluding the first. Not "next along the path" — that reads as a targeting
  rule rather than as electricity.
- Damage on the fork: some fraction of the original (start at 0.6), and it
  should not fork again. One extra target, not a cascade.
- Draw it as a white-cored fork from first to second target, visually distinct
  from Coil's bowed arc.

---

## 3. Veterancy — a sixth armory track, earned on a clean sweep

Multiplies **XP gain**, so towers level faster. `+8%` a level, `+40%` maxed.

**It needs no new base stat on any class**, which is what makes it safe to add
alongside Sever: every tower levels, so the non-zero-base rule is satisfied
without touching `TOWER_TYPES` at all. It is the only candidate considered that
adds no new combat number.

**It is the right shape for the deepest reward.** It does not raise the ceiling
— a level-10 tower is still a level-10 tower — it raises how fast you get there.
v42 deliberately slowed levelling so a Node maxes around wave 27-30; this lets a
veteran pull that toward 20 without changing what the top of the ladder is worth.

**Per class it is a real choice**, because buying it on Breaker is buying past
`XP_RATE.breaker = 0.45`, the deliberate handicap on the class that deals the
most damage per shot.

Notes for the implementer:

- It multiplies inside `damageEnemy`, where `XP_RATE[src.type]` and the
  difficulty's `xp` are already applied.
- Price it flat — **neither `spec` nor `weak` for anybody**. A track earned by
  clearing a circuit three times should cost every class the same; that is also
  a clean statement about what an earned track is.

---

## 4. Circuits earned by a clean sweep

Agreed: **holding a circuit on all three difficulties opens more circuits.**

Today `routeUnlocked(progress, difficulty, r)` opens circuit *r* when *r-1* was
won **on that difficulty**, and `ROUTES` holds three boards ordered easiest to
hardest (~36 / 31 / 14 cells; length *is* the difficulty here).

The intended reading is **new boards beyond the current three**, earned by
sweeping — not a retune of the existing gate. Stated explicitly because the
other reading is dangerous: making the current unlock require all three
difficulties would strand an Easy-only player on circuit 1 forever, which takes
progression *away* from the people who have the least of it.

So:

- Add circuit 4 (and 5, if the shape suggests itself) to `ROUTES`, continuing
  the easiest-to-hardest ordering — i.e. **shorter than route 3**, or the same
  length with a nastier pinch.
- `sweptCircuit(progress, r)` — held on all three difficulties.
- `routeUnlocked` keeps its current rule for circuits 1-3, and gains a sweep
  requirement for the ones past them.

Constraints on any new route, all pinned by existing tests:

- It must **transpose cleanly** — `LAYOUT_TALL` is the exact transpose of
  `LAYOUT`, and rotation is lossless only because the transposed path has an
  identical length.
- It must not start in a corner in a way that makes `overlook()` in the test
  suite unable to find a covering cell. Reordering the routes once broke a dozen
  tests for reasons unrelated to what any of them tested.
- The picker draws previews from the engine's own waypoints, so a new route
  needs no art — but check the two-column picker still fits five rows on a
  phone without scrolling past the fold.

---

## The gating ladder

| Reward | Earned by |
|---|---|
| Sever (tower class) | hold any circuit on **Medium** |
| Chain (armory track) | hold any circuit on **Hard** |
| Veterancy (armory track) | hold **one circuit on all three difficulties** |
| Circuits 4+ | hold **one circuit on all three difficulties** |

```js
export const CLASS_UNLOCK = { sever: { difficulty: 'medium', circuits: 1 } };
export const TRACK_UNLOCK = { chain: { difficulty: 'hard', circuits: 1 },
                              veterancy: { sweep: 1 } };
```

Two rules to hold to, both learned from the research ladder in Flak Battery:

1. **Medium, not Hard, for the first reward.** Hard is two wins deep on a given
   circuit. Gating the only new content behind it means most players never learn
   the feature exists.
2. **Show everything locked, with its requirement written on it.** A dimmed
   fourth palette slot reading "Hold a circuit on Medium", dimmed armory rows
   reading "Hold a circuit on Hard". This is what turns "content nobody sees"
   into an advertisement for playing Medium, visible from the first run — and it
   is exactly what the v44 research ladder does with its locked rungs.

## Costs to budget for

- **`CLASS_BASE_COST` gains two entries, and the armory-total test must be
  re-derived.** That test pins the full armory at ~5.7x an Easy run's bounty
  *as a ratio*, deliberately, so retuning has to stay honest about it. Two more
  tracks and a fourth class raise the total; the ratio has to be re-argued, not
  just re-recorded.
- **Two more armory rows and one more column.** Rows are cheap; the column is
  the one that needs the phone breakpoint retuned.
- **The palette strip** — see Sever above. This is the only piece with a real
  chance of costing board height.
- Everything here touches files the app loads: bump `CACHE_VERSION` in
  `../sw.js` **and** `BUILD` in `../shared/version.js`.

## Order to build in

1. Sever, engine first (stats, mark, heal-block), then palette + armory column.
2. Chain, engine first (counter, fork resolution, Breaker-at-detonation), then
   the fork art.
3. Veterancy — smallest of the three, and it wants the armory-cost retune that
   Chain will already have forced.
4. New circuits + the sweep gate, last: it is the only piece whose difficulty
   can only be judged by playing the other three.
