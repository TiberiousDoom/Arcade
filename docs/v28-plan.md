# v28 plan — round 6 feedback

The feedback below was written against **v27** (the build currently in `shared/version.js`),
so the work it drives ships as **v28**. Nothing here is implemented yet; this file
is the plan, the reasoning, and the open questions. Real decisions move to
[DECISIONS.md](DECISIONS.md) as they are made.

Two notes that apply to the whole round:

- **Every item below touches a file the app loads**, so `CACHE_VERSION` in
  [../sw.js](../sw.js) and `BUILD` in [../shared/version.js](../shared/version.js)
  must both go to `v28`. `shared/version.test.js` catches a half-bump, nothing
  catches forgetting both.
- New files (there is one candidate — a research module for Flak Battery) must be
  added to `PRECACHE` in `sw.js` or a first-run offline launch breaks.

---

## Choke Point

### 1. Cooldown on the tower-ready animation (flicker fix)

**What's happening.** `stepTowerArt` in
[choke-point.html:926](../games/choke-point/choke-point.html) drives `barrelOut`
straight off `E.towerReady(world, t)`, which is a bare distance test against
`range + READY_MARGIN` ([engine.js:652](../games/choke-point/engine.js)). An enemy
hovering on that circle flips the boolean every frame, so the barrel pumps in and
out. `BARREL_SPEED` (5.2 → full extension in ~0.19s) makes the pump fast enough to
read as a strobe rather than as motion.

**Fix — shell only, engine untouched.** This is presentation state and belongs
where `barrelOut` already lives. Two changes together:

- A **hold timer**: once `want` goes to 1, latch it and keep it for
  `READY_HOLD` (~1.2s) after the last frame that said ready. A tower that has just
  been busy stays deployed through a gap.
- **Hysteresis** on the threshold so the latch isn't doing all the work: wake at
  `range + READY_MARGIN`, sleep only outside `range + READY_MARGIN * 2`. Cheapest
  implementation is a second exported helper beside `towerReady` taking a margin
  multiplier, rather than duplicating the distance loop in the shell.

Keep `towerReady`'s existing signature — the render test drives it, and its
docstring already says "presentation only; nothing in the simulation reads it."

**Tests.** `towerReady` with an explicit margin gets an engine test. The hold timer
is shell state; the render test can assert a tower stays deployed for a frame or
two after its last enemy is removed.

### 2. Reduce the XP bounty by 10×

**Settled:** 10×, not the 100× first written here. 100× put the full 1→10 climb at
~60,000 damage from a single tower and took level 10 off the table inside a run;
10× makes it a genuine late-run achievement instead of a formality. The rest of
this section is unchanged apart from the factor.

**What this means mechanically.** XP is credited in `damageEnemy`
([engine.js:704](../games/choke-point/engine.js)): `dealt + XP_KILL_BONUS` on a
kill, where `dealt` is damage that actually landed. So there are two knobs — the
per-damage credit (implicitly 1.0, never named) and `XP_KILL_BONUS` (3).

**Recommendation.** Name the implicit knob and divide *both* by 10, so the whole
XP economy moves as one number rather than only the kill bonus:

```js
export const XP_PER_DAMAGE = 0.1;   // was implicitly 1
export const XP_KILL_BONUS = 0.3;   // was 3
```

Leave `xpForNext` alone. That keeps the level curve's *shape* and the two
tested Breaker-reach requirements intact, and puts all of the change in one place.

**Consequence.** Level 2 currently costs 18 XP ≈ 18 damage; after the change it
costs ≈ 180 damage. The full 1→10 climb is ≈ 600 XP ≈ **6,000 damage from a single
tower** — a wave-14 board is ~4,600 total enemy HP, so a well-sited tower maxes out
somewhere in the low-to-mid teens rather than within the opening waves. That is the
intent: level 10 stays reachable, but as the reward for a tower that has done a
run's worth of work.

Knock-ons: the popup's XP readout ([choke-point.html:454](../games/choke-point/choke-point.html))
prints `Math.floor(t.xp)`, which would sit at 0 for a long time — show one decimal,
or better, show a progress bar. Existing engine tests that grant XP by dealing
damage will need their expectations rescaled; they should be rewritten to drive
`addXp` directly where they're testing the *level* machinery rather than the rate.

### 3. Move tower

New verb in the engine, next to `buildTower`/`sellTower`:

```js
export function moveTower(w, i, c, r)   // keeps type/level/xp/priority, resets cool
```

**Rules to settle, with recommendations:**

- **Cost**: free moves make placement decisions weightless — a player would just
  drag the whole defence to follow the wave. Charge a **relocation fee** equal to
  `sellValue(tower)` (half build cost), which is exactly the money a sell-and-rebuild
  would have burned. So moving is never worse than the workaround, and never free.
- **Legality**: same `canBuild` predicate for the destination (on-grid, not path,
  empty), minus the affordability check, plus the fee.
- **Cooldown**: reset `cool` to full on arrival, so a move can't be used to dodge a
  reload.
- **When**: allowed mid-wave. The fee is the brake; forbidding it between waves
  only would make it a chore ("wait for the clear, then shuffle").

**Shell.** The tap-a-tower popup already exists and already holds Sell and the
three priority buttons; add a **Move** button that puts the board into a
move-pending state (the selected tower ghosts, valid cells highlight, next tap on
an empty cell commits, tap elsewhere cancels). Drag-to-place already exists for
building, so dragging an existing tower to an empty cell is the natural second
gesture and should do the same thing.

**Snapshot.** No new persisted state — the tower object is unchanged.

**Tests.** Move preserves level/xp/priority; move onto path/occupied/off-grid
fails and changes nothing; the fee is charged; a move with insufficient
components fails; cooldown resets; round-trips through `relayout` correctly.

### 4. Coil's cheap upgrade is splash

One-line change in `TOWER_TYPES.coil` ([engine.js:166](../games/choke-point/engine.js)):
`spec: 'range'` → `spec: 'splash'`.

**But `weak` needs to move too**, and this is the part worth thinking about. Coil's
current pair is `spec: range / weak: dmg`. Coil's base splash is **0**, and
`stats` computes splash as `b.splash * grow('splash')` — a multiplicative growth on
zero is still zero. **Buying the splash track on a Coil currently does nothing at
all**, cheap or not. So this change requires either:

- **(a)** giving Coil a small base splash (recommended: `splash: 24`, about a third
  of a cell, so a Coil chills a little cluster rather than one enemy — which fits
  what Coil is *for*, since `SLOW_BRITTLE` then sets up several targets at once), or
- **(b)** making `slow` apply within `splash` radius instead of adding damage
  splash. Thematically better, mechanically a bigger change to `fireTower`.

Recommend **(a)** — one number, and it makes the discount meaningful immediately.
Then set `weak: 'range'` (the track it currently specialises in), which keeps the
three classes distinct: Node cheap rate / dear splash, Breaker cheap splash / dear
rate, Coil cheap splash / dear range.

Note this changes what a Coil is: from a long-reach single-target debuffer to a
short-reach area debuffer. That is a real design shift and belongs in DECISIONS.md.
The armoury is persistent, so **existing saves carry Coil range levels bought at
the old discount** — harmless (they still apply) but worth knowing.

### 5. Make higher upgrades more expensive

`classCost` is currently linear: `base * (1 + level * 0.8)`
([engine.js:243](../games/choke-point/engine.js)) — levels 0–4 of a 50-base track
cost 50 / 90 / 130 / 170 / 210, total 650. Flat-ish, so the last level is only 4×
the first.

**Change to geometric**, matching how every other cost curve in the repo behaves
(Flak Battery's `UPGRADES.costs` roughly 1.75×/tier, `MOUNT_COST` ~1.6×/step):

```js
const CLASS_COST_STEP = 1.85;
c = CLASS_BASE_COST[track] * Math.pow(CLASS_COST_STEP, level);
```

That gives 50 / 93 / 171 / 317 / 586, total 1,217 — roughly double the current
full-track bill, with the *last* level costing 12× the first. Combined with the
XP change above (which removes level-10 towers as a free power source), this is
what keeps a persistent armoury from solving the game; `DIFFICULTIES` remains the
other counterweight.

`SPEC_DISCOUNT`/`WEAK_PENALTY` still multiply on top, unchanged. `CLASS_MAX` stays 5.

**Tests.** Existing armoury tests assert affordability at specific amounts and
will need their numbers moved; add one asserting cost is strictly increasing per
level and that spec < base < weak at every level.

### 6. Make the tower's centre hub glow like the outer ring

`drawTower` ([choke-point.html:962](../games/choke-point/choke-point.html)) draws the
hub with a plain `ctx.fill()` while the ring goes through `extrudeDisc` and the
barrel through `glowStroke`. That's why it reads flat.

Swap the flat fill for `glowDot(ctx, cx, cy, rr * .34 * out, col)` (already
imported), plus a small hot white core the way `drawCore` does
([choke-point.html:913](../games/choke-point/choke-point.html)) — that pairing is the
established "this is emissive" idiom in this codebase. Keep the `out`-scaled radius
so it still grows into place. Respect `reduce` (reduced motion) the same way the
rest of the file does.

Render-test coverage exists for deployed towers already; the screenshot tool
(`tools/screenshot.mjs`) is how this gets judged, not a headless browser.

### 7. "Purchase Upgrades" becomes a small button next to Rush and FF

Currently `shopBtn` is appended to `#controls` as its own full-width row
([choke-point.html:341](../games/choke-point/choke-point.html)); the wave row holds
Start / Rush / FF / Auto with `#waveRow #startWave, #waveRow #rushWave{flex:2 1 0}`.

Move `shopBtn` into `waveRow` and give it a glyph rather than a word — the row is
already glyph-based for its two mode buttons (`▶`/`×`, `↻`). Suggest **`⚒`** with
an `aria-label` of "Purchase upgrades", `flex:1 1 0` so it sits at the same width
as FF and Auto while Start and Rush stay double-width.

**This changes `#controls` height** (one fewer row), which `makeFit` measures — the
board gets taller for free, but verify at 375×812 **with simulated safe-area
insets**, since Choke Point is the one game on `fillWidth` + `body.scrolls` and a
desktop browser reports insets as 0. That mistake has been made twice.

The render test drives the armoury through real DOM clicks, so it will catch a
broken selector.

---

## Flak Battery

Difficulty is confirmed good ("the ramp up after level seven is challenging"), so
**`hpScale`, `waveCount` and `KIND_UNLOCK` are not to be touched this round.** The
research tree below adds persistent player power, which pushes the *other* way —
see the counterweight note there.

### 8. Show lives in the header

**Already there, and that's the finding.** [flak-battery.html:117](../games/flak-battery/flak-battery.html)
renders `<div>Cells <b id="uiLives">3</b></div>`. So the ask is legibility, not a
missing feature: "Cells" doesn't read as lives, and it's the fourth of six items in
a `.meta` row that wraps on a narrow phone, so it can end up below the fold.

Plan:
- Relabel to **Lives**.
- Render as **pips** (`●●●`) rather than a number — the same shape Choke Point's
  Core integrity and the shop's tier pips already use, and it's readable at a
  glance mid-wave, which a digit is not.
- Move it to the front of `.meta`, next to Wave. Score/Best/Scrap are things you
  check between waves; lives is the one you check while playing.
- Flash it red on a breach (the shell already knows — `livesBefore` at
  [line 408](../games/flak-battery/flak-battery.html)).

### 9. Revisit every upgrade description

Confirmed real: **Optics' "longer intercept read" describes `predict`, which is the
number of seconds ahead `predictHit()` searches for an intercept**
([flak-battery.html:434](../games/flak-battery/flak-battery.html), `maxT = S.predict`)
— it sets how far out the aim marker will find a solution. Nothing in the phrase
"longer intercept read" says that.

Worse, and worth fixing at the same time: the comment at
[line 436](../games/flak-battery/flak-battery.html) says the intercept marker follows
**mount 1's optics only**. Since v27 made optics per-emplacement, buying Optics on
mounts 2–5 changes their shot speed but has **no visible effect** on the marker at
all. Either the marker should read the best `predict` across mounts, or the blurb
must stop promising something four fifths of the battery doesn't deliver.
Recommend the former (max across mounts) — it's one line, and it makes the
purchase honest.

Rewrite pass over all four `UPGRADES[*].blurb` strings
([engine.js:427](../games/flak-battery/engine.js)), plus `GUN_TYPES` blurbs and the
power-up blurbs, to the same rule: **say the effect, not the flavour**, and name
the number where there is one. Draft:

| branch | now | proposed |
|---|---|---|
| Barrel | "Damage per shot, then projectile size" | "More damage per round, and a bigger round" |
| Chamber | "Heat capacity and cooling — holds Overdrive longer" | "Less heat per shot, faster cooling, shorter lockout" |
| Optics | "Projectile speed, then a longer intercept read" | "Faster rounds, and the aim marker leads targets further ahead" |
| Munitions | "Extra pierce and wall bounces" | "Rounds punch through more craft and bounce off more walls" |

Chamber's proposal is the one that gains most: `lock` (overheat lockout duration)
is a third real effect the current blurb doesn't mention at all.

### 10. Extra barrels become a per-emplacement upgrade

**This reverses a documented decision** — DECISIONS.md, 2026-08-02, "Multi-barrel:
battery-wide, not per-gun". The reasoning then was that battery-wide matched how
mount *count* works and avoided the repo's first per-gun-instance upgrade path.
**That reasoning is now obsolete**: v27 moved the entire upgrade tree onto the gun,
so per-gun-instance upgrades are the norm and the battery-wide barrel count is the
odd one out. Reversing it is consistent, not a flip-flop — the DECISIONS entry
should say so.

Changes:

- `w.barrels` → `gun.barrels` (default 1). `barrelCost(w)` → `barrelCost(w, mountIndex)`,
  `buyBarrel(w)` → `buyBarrel(w, mountIndex)`.
- `fireGun` already reads `BARREL_OFFSETS[w.barrels]`
  ([engine.js:920](../games/flak-battery/engine.js)) — becomes `gun.barrels`. Heat is
  already per-gun and already scales with barrel count, so the balancing mechanism
  needs no change.
- The Barrels card moves off the Battery tab onto each **mount's** tab, below its
  four branches and above Refit. `drawCannonPortrait(ctx, type, barrels)` already
  takes a barrel count and reads `BARREL_OFFSETS` from the engine — pass the gun's
  own count and the portrait stays correct for free.
- `snapshot`/`hydrate`: `barrels` moves from the world into each gun entry.
  **Hydrate must read the old top-level `w.barrels` as a fallback** and apply it to
  every gun, the same way v27 read `charge` as well as `components` in Choke Point.
- `BARREL_COST` `[260, 460]` was priced as a battery-wide purchase. Per-mount it is
  bought up to five times, so it should come **down** — suggest `[140, 250]`,
  keeping the five-mount total roughly double the old single purchase.

Tests: the existing multi-barrel tests all move to naming a mount; add one that two
mounts can hold different barrel counts, and one that an old snapshot restores.

### 11. "Add emplacement" as a `+` tab

`renderTabs` ([flak-battery.html:547](../games/flak-battery/flak-battery.html))
builds one tab per gun and then the Battery tab. Insert a third kind between them:
a `+` tab with a dashed border.

- Class `tab add`, dashed border via a new rule in the local `<style>` (the tab
  styles are local to this shell, not in `theme.css`, so no shared-theme change).
- Label: `+` glyph with the cost underneath in the `<span>` slot the other tabs use
  for the gun name — so it reads `+ / 130` and the price is visible without
  entering the Battery tab.
- Click calls `E.buyMount(world)`; on success, **switch `shopTab` to the new mount**
  and re-render, so you land on the gun you just bought.
- Disabled (dimmed, not hidden — the strip must not reflow) when
  `E.mountCost(world) === null` (at `MAX_MOUNTS`) or when scrap is short. Same
  affordability wording as the branch buttons: show the shortfall.

The add-mount card on the Battery tab then becomes redundant; remove it, leaving
that tab for research (see below).

### 12. A persistent research tree

The largest item in the round, and the one with a working precedent: **Choke
Point's armoury** — persistent progression owned by the shell, stored on the world
so the engine stays the only thing that resolves numbers, and touching no storage
from the engine.

**Currency.** A new **Research Points (RP)**, separate from scrap. Scrap is the
in-run economy and must stay that way; mixing them would mean every scrap spent on
a gun was progression forgone, which is a miserable trade to be asked to make
mid-wave.

RP is earned **at the end of a run**, from how far you got:

```js
export function researchEarned(w)   // pure; e.g. (wave - 1) + floor(wave / 5) * 2
```

End-of-run, not per-wave, so it cannot be farmed by restarting; and a function of
the *wave reached*, so the thing that earns progression is the thing the player is
already trying to do. The shell adds it to the persistent store on `w.over` and
shows "+N research" on the game-over banner.

**What RP buys.** Two things, matching the ask:

1. **Gun types.** `GUN_TYPES[type].unlock` is currently a *scrap* cost paid every
   run ([engine.js:982](../games/flak-battery/engine.js)) — research the railgun,
   die, research it again. Move that cost to **RP, paid once, forever**. The
   per-mount `retrofitCost` stays scrap, so fitting the gun is still a real in-run
   decision; only knowing how to build it becomes permanent.
2. **Upgrade depth.** Branch tiers 1–3 stay available to everyone; **tiers 4 and 5
   are gated per branch behind RP**. `upgradeCost(upgrades, branch)` gains a cap
   argument (or reads `w.research`) and returns `null` above the researched cap, so
   the shop's existing "Maxed" path renders a locked tier with no new UI state.

**Shape, mirroring the armoury exactly:**

- `w.research = opts.research || newResearch()` on `createWorld`; `resetGame`
  deliberately leaves it alone.
- A new `shared/research.js`? **No** — keep the storage key local to
  `flak-battery.html`, the way `ARMOURY_KEY` is local to `choke-point.html`,
  for the stated reason that only one game has one. Revisit if a second game ever
  wants it. **This means no new file, so no `PRECACHE` change.**
- Guarded `readResearch`/`writeResearch` with the same defensive clamping the
  armoury uses (an out-of-range stored value must not hand out stats no shop can
  sell).
- `snapshot`/`hydrate`: research is **not** run state — exclude it, exactly as
  `classUpgrades` is excluded. A resumed run reads current research from storage.
- A **"Reset research"** control in the settings menu, armed-then-confirm, copying
  `wipeArmoury` ([choke-point.html:602](../games/choke-point/choke-point.html)).

**UI.** The Battery tab becomes the **Research** tab (it loses the add-mount card to
item 11 and the barrels card to item 10, so it is nearly empty otherwise): RP
balance at the top, a row per gun type, and a row per branch for the tier-4/5
unlocks. Costs shown in RP, visually distinct from scrap.

**The counterweight problem, stated up front.** Persistent progression makes every
run after the first easier than the last, and the owner has just said the current
difficulty is *right*. Choke Point answered this with `DIFFICULTIES` (easy/medium/hard
scaling enemy HP and the opening purse, recorded alongside the score). Flak Battery
has no such dial. **Recommendation: don't build one this round** — ship research,
play it, and see whether the curve actually goes soft; a difficulty selector is a
day's work whenever it's wanted and it's better tuned against evidence. But
`researchEarned`'s constants should be treated as first drafts, and the RP prices
set high enough that the tree is several runs of work rather than one.

**Tests.** `researchEarned` is pure and gets a table test. Gun unlock via RP:
affordable/unaffordable/already-owned/persists-across-`resetGame`. Tier gating:
tier 4 unbuyable unlocked, buyable once researched, `upgradeCost` returns `null` at
the cap. Snapshot excludes research. Plus the existing gun-unlock tests move off
scrap.

---

## Hull Breach

### 13. Early levels: single-hit bricks only

`brickHp(row, rows)` ([engine.js:210](../games/hull-breach/engine.js)) is
`clamp(ceil((rows - row) / 2), 1, 3)` and **takes no level argument**, so level 1
already ships three-hit bricks in its back rows.

Change to `brickHp(row, rows, level)`:

```js
export const SOFT_LEVELS = 2;      // levels that are all single-hit
export const ARMOUR_FROM = 4;      // full 1-3 banding from here on
```

- Levels 1..`SOFT_LEVELS`: always 1.
- Level 3: cap at 2 (a middle step, so the jump to armour isn't a cliff).
- Level `ARMOUR_FROM`+: current formula, unchanged.

**Callers to update** — `brickHp` is called from `buildBricks`
([engine.js:259](../games/hull-breach/engine.js)), which has `level` in hand, so
this is a short list. The shell's brightness banding reads `brick.maxhp` off the
built brick, not `brickHp`, so it needs no change and single-hit bricks simply all
render at full brightness. `hydrate` rebuilds via `buildBricks(w.level, w.L)`, so a
save restores correctly by construction.

**Knock-on to watch:** `brickScore(maxhp)` and `brickSalvage(maxhp)` both scale with
armour, so easier openers also pay less — level 1's salvage drops by roughly half.
Since the shop opens on the first level clear, that's a slower start to upgrades.
Recommend compensating with the level-clear bonus (`100 + level * 50` at
[engine.js:746](../games/hull-breach/engine.js)) rather than by inflating
`brickSalvage`, which would decouple pay from armour everywhere.

**Tests.** Existing `brickHp` tests are row-based and will need a level; add
assertions that every brick on levels 1–2 has `maxhp === 1`, that level 4 still
produces the 1/2/3 strata, and that traversal-time/layout-independence invariants
are untouched.

---

## Suggested sequence

Grouped so each group is independently testable and shippable, cheapest first:

1. **Cheap and self-contained** — Choke Point items 1, 6, 7; Flak Battery items 8, 9;
   Hull Breach item 13. No engine API changes except `brickHp`'s signature and one
   `towerReady` helper.
2. **Choke Point economy** — items 2, 4, 5 together. They all move numbers that
   interact, so tuning them in one pass beats three separate re-balances.
3. **Choke Point move tower** — item 3. New verb, new shell gesture, self-contained.
4. **Flak Battery barrels + `+` tab** — items 10, 11. Both touch the shop's tab
   rendering; do them together.
5. **Flak Battery research** — item 12. Largest, depends on item 11 having freed up
   the Battery tab, and wants the description rewrite (item 9) already done so the
   research rows can reuse the same wording.

Bump `BUILD`/`CACHE_VERSION` once, at the end.

## Open questions

- ~~**Item 2**: is 100× literal?~~ **Settled: 10×.**
- **Item 4**: Coil's splash track is currently inert (base splash 0). Giving Coil a
  base splash changes what the class *is* — confirm that's wanted, or take option (b)
  and make its slow area-of-effect instead.
- **Item 3**: is the half-cost relocation fee right, or should moving be free
  between waves and paid mid-wave?
- **Item 12**: no difficulty dial is planned for Flak Battery this round, on the
  grounds that the current curve is liked and research's effect on it is unmeasured.
  Say so if a difficulty selector should ship alongside instead.
