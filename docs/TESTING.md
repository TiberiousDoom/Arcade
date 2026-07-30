# Device test checklist — build v11

For a real phone, via **https://tiberiousdoom.github.io/Arcade/**. Everything
below was built and verified in an emulator only; the point of this pass is the
things an emulator cannot tell us — thumb reach, legibility at real size, and
whether the difficulty numbers are any good.

Written 2026-07-29 for build v11. When a section is settled, record the outcome
in STATUS.md's open decisions and delete the section rather than leaving it to
rot.

---

## 0. First: confirm you're actually on v11

The service worker serves cache-first, so a phone will happily keep running an
old build and every symptom below would then be meaningless.

- [ ] Open any game → **?** button → the bottom line reads **Arcade v11**.
      (Or the cabinet footer.)
- [ ] If it doesn't: fully close the app, reopen, and reload once more. First
      load installs the new worker, second reads from it.

**Do not test anything else until this reads v11.**

---

## 1. Circuit Breaker

This has **never been on a real device**, so the basics need checking as well as
the new work.

### Basics never yet confirmed on hardware
- [ ] Board fits the screen with no scrolling, portrait.
- [ ] Tapping an empty cell builds the selected tower — and the cell you *meant*
      is the cell that gets it. (Cells are ~45px; this is the main worry.)
- [ ] Tapping a tower opens the upgrade/sell popup near your thumb, not off-screen.
- [ ] Popup **stays open** after Upgrade, and the tier/cost update in place.
- [ ] Tapping away from the popup closes it.
- [ ] Palette buttons (72px) are comfortable to hit; Start Wave likewise.
- [ ] Tower barrels point at what they're shooting and don't freeze facing nothing.

### Circuits (new)
- [ ] HUD shows **Circuit A/B/C**.
- [ ] Lose a run → Play again → **the circuit letter changes and the board is
      visibly different**. This is the headline new feature; if it doesn't
      change, route cycling is broken.
- [ ] Rotate the phone mid-run: towers stay put relative to the board and
      **none end up sitting on the path**.

### Enemy traits (new — waves 4, 7, 9, 11)
Reach at least **wave 11** for this section. Each is checking one thing: can you
tell *by looking* why a tower isn't working?
- [ ] **Wave 4, Swarm** — a tight burst of small fast ones. Does Breaker's splash
      visibly pay off here?
- [ ] **Wave 7, Shell** — heavy ring. Do Nodes visibly struggle where a Breaker
      doesn't? Is upgrading a Node a viable answer, or does it feel hopeless?
- [ ] **Wave 9, Phase** — dashed shell + chevron. Can you tell it apart from a
      *slowed* enemy at a glance? (These were the same colour before; the fix is
      untested at phone size.)
- [ ] **Wave 11, Patch** — cross, with a dashed heal radius. Is it obvious that
      something is being repaired, and that the patch is the cause?
- [ ] Overall: when a tower underperforms, does it read as *wrong tool* or as
      *broken game*? If the latter, the cues are too subtle.

### Coil (new)
- [ ] Does Coil now feel worth building? **This is the number I'd most like a
      read on** — `SLOW_BRITTLE` is ×1.4 and was a guess.
- [ ] Is it clear that slowed enemies take more damage, or does it need saying
      more loudly than one line of help text?

### Difficulty
- [ ] How far do you get on a first run, and where does it stop being winnable?
- [ ] Is the early game (waves 1–3, before any new type) now **boring**? It was
      reported too easy and I deliberately changed nothing there.
- [ ] Does charge income feel right, or are you idle waiting to afford anything?

---

## 2. Serpent Battery

Aim is settled — don't re-litigate it. This is about the difficulty rework.

### The curve
- [ ] **Wave 1 should now feel gentle** — it's all standard segments, where it
      used to contain six different kinds at once. Is it too gentle?
- [ ] Kinds arrive one at a time: carrier 2, armored 3, volatile 4, shielded 5,
      regen 7, splitter 9. Does each get a beat to be understood?
- [ ] Segments get tougher as well as more numerous (+14%/wave, capped ×4). Does
      a late wave feel *chewy* or just *long*?
- [ ] Where does the run actually end for you, and does it end because of
      difficulty or because of tedium?

### The head (new)
- [ ] The head has a **ring that thins as you clear the body behind it**. Without
      reading the help text, is it obvious that this means "protected"?
- [ ] Shots on a protected head flash white and barely scratch it. Does that read
      as *armoured* or as *broken*?
- [ ] **Killing the head kills the whole serpent.** Does that land as a payoff?
- [ ] Try an early decapitation with overdrive or a rail gun. Is the gamble
      tempting, or obviously never worth it?

### GUI
- [ ] HUD: the numbers should be bigger and the labels smaller. Easier to read
      mid-fight?
- [ ] Shop: buttons are 42px and chips 34px. Comfortable now?
- [ ] Shop: an unaffordable upgrade says **"40 · need 15 more"** and looks
      different from "Maxed". Clear?

---

## 3. Angle Iron

### Powerups (new)
- [ ] Capsules drop from bricks and fall — catchable with the paddle?
- [ ] Glyphs legible at phone size: **3** split · **↔** wide · **▼** slow · **+** spare.
- [ ] **3** splits the ball into three. Does multiball become chaos or fun?
- [ ] **↔** widens the paddle and tints it green; a bar bottom-left counts down.
- [ ] **▼** slows the ball. Does 12s feel long or short?
- [ ] **+** grants a spare ball (check the Balls counter).
- [ ] Effect timer bars sit just above the floor line and **don't collide with
      the audio button**.
- [ ] Drop rate (~1 brick in 7) — treat or torrent?

---

## 4. Portrait-only — the decision

The flag is reversible; this pass decides whether landscape gets deleted.

- [ ] Turn the phone sideways **in the browser** (not installed). You'll get a
      letterboxed portrait board — this is unavoidable in a tab. Tolerable?
- [ ] If installed to the home screen, it should stay locked portrait.
- [ ] Does anything make you miss landscape?

**Outcome:** keep the flag / delete landscape for good. If deleting, that removes
~105 references across 13 files including the transpose tests.

---

## Notes to bring back

Free text is more useful than ticks here:

- Which single change most improved a game?
- Which felt worse than before?
- Anything that looked like a bug (it may be an unexplained mechanic).
- Any moment you didn't know what to do next.
