# Device test checklist — build v22

For a real phone, via **https://tiberiousdoom.github.io/Arcade/**. Everything
below was built and verified in an emulator only; the point of this pass is what
an emulator cannot tell us — thumb reach, legibility at real size, frame rate,
and whether the difficulty numbers are any good.

Updated 2026-07-31 for build v22. When a section is settled, record the outcome
in STATUS.md's open decisions and delete the section rather than leaving it to
rot.

**Already settled, do not re-test:** Flak Battery's aim; Drift Net's food
visibility; Choke Point's enemy trait cues surviving the glow.

**The games were renamed.** Drift Net (was Live Wire) · Flak Battery (was
Serpent Battery) · Choke Point (was Circuit Breaker) · Hull Breach (was Angle
Iron). Personal bests and saved runs were discarded in the process, as agreed.

---

## 0. First: confirm you're actually on v22

The service worker serves cache-first, so a phone will happily keep running an
old build and every symptom below would then be meaningless.

- [ ] Open any game, tap **?**, and check the bottom line reads **Arcade v22**.
- [ ] If it doesn't: fully close the app, reopen, and reload once more. The
      first load installs the new worker, the second reads from it.

**Do not test anything else until this reads v22.**

---

## 1. Frame rate — the whole app

Additive compositing on a phone GPU is the single thing that cannot be measured
from a development machine, and every game now uses it.

- [ ] **Choke Point, wave 12+** — 70+ enemies, each with glow passes. Worst case.
- [ ] **Drift Net with a long net** — the only game with full-frame phosphor
      trails.
- [ ] **Hull Breach with multiball** — up to six trailing interceptors.
- [ ] **Flak Battery, wave 15+** — a long column plus heavy fire.
- [ ] Anything stutter? Note roughly when.

## 2. The art, now on all four

- [ ] Does the collection read as **one thing** — same look, cubes for invaders,
      spheres for defenders, everywhere?
- [ ] **Flak Battery**: hp numbers on tough craft are legible (they were briefly
      invisible against the new dark bodies).
- [ ] **Flak Battery**: the head's protection ring still reads as "protected".
- [ ] **Hull Breach**: damaged plates read as *lights going out*, not as fading
      away — a plate about to break should not look already gone.
- [ ] **Hull Breach**: the interceptor's trail helps rather than distracts.
- [ ] **Drift Net**: cubes-on-a-tether still reads as one connected body.
- [ ] **Choke Point**: the circuit path — too dim now? It was pushed deliberately
      quiet.

## 3. The setting

- [ ] Cabinet reads "Four games · one invasion", cards are in story order and
      numbered 1/4 → 4/4.
- [ ] Each game's **?** panel opens with one italic line of setting.
- [ ] Does the arc land — invade, defend twice, answer — or does it need saying
      more loudly than one line per game?

## 4. Mid-run saves

Choke Point, Flak Battery and Hull Breach only. Drift Net is deliberately
excluded, being one-life score-attack.

- [ ] Start a run, get a few waves/levels in, then **switch apps** (don't just
      lock the screen). Returning should offer **Resume run?** with **Continue**
      and **New run**.
- [ ] **Continue** restores score, wave/level, towers, lives, plate damage.
- [ ] **New run** starts fresh and the offer doesn't return.
- [ ] After a proper game over you are **not** offered a resume.
- [ ] Repeat for all three.

## 5. Choke Point — depth

Still never reported on. Needs a run to **at least wave 11**.

- [ ] HUD shows **Circuit A/B/C**; losing then playing again gives a different
      letter and a visibly different board.
- [ ] **Wave 4, Swarm** — does Breaker's splash visibly pay off?
- [ ] **Wave 7, Shell** — do Nodes visibly struggle where a Breaker doesn't? Is
      *upgrading* a Node a viable answer, or does it feel hopeless?
- [ ] **Wave 9, Phase** — Coil should be visibly useless against it.
- [ ] **Wave 11, Patch** — obvious that something is being repaired, and why?
- [ ] **Does Coil feel worth building?** `SLOW_BRITTLE` is ×1.4 and was a guess.
      The most valuable single number to get a read on.
- [ ] Still too easy? Where does it stop being winnable?
- [ ] Are waves 1–3 boring? Nothing was changed there, deliberately.
- [ ] Tapping a cell builds on the cell you *meant* (~45px targets).
- [ ] Rotate mid-run: towers stay put, none end up on the path.

## 6. Flak Battery — difficulty

Still never reported on. Aim is settled.

- [ ] **Wave 1 should feel gentle** — all standard craft, where it used to throw
      six kinds at once. Too gentle?
- [ ] Kinds arrive one at a time: carrier 2, armored 3, volatile 4, shielded 5,
      regen 7, splitter 9. Does each get a beat to be understood?
- [ ] Late waves should feel *chewy*, not merely *long*.
- [ ] Shots on a protected head barely scratch it. Does that read as **armoured**
      or as **broken**?
- [ ] **Killing the head kills the whole column.** Does it land as a payoff?
- [ ] Try an early decapitation with overdrive or a rail gun — tempting, or
      obviously never worth it?
- [ ] Shop: 42px buttons, 34px chips. Comfortable? Does "40 · need 15 more" read
      clearly and look different from "Maxed"?

## 7. Hull Breach — powerups

Still never reported on.

- [ ] Capsules drop and are catchable.
- [ ] Glyphs legible: **3** split · **↔** wide · **▼** slow · **+** spare.
- [ ] Effect timer bars sit above the floor line and don't collide with the
      audio button.
- [ ] Drop rate (~1 brick in 7) — treat or torrent?
- [ ] Does multiball become fun, or chaos?

## 8. Portrait-only — the decision

The flag is reversible; this pass decides whether landscape gets deleted.

- [ ] Sideways **in a browser tab** (not installed) gives a letterboxed portrait
      board — unavoidable in a tab. Tolerable?
- [ ] Installed to the home screen, it should stay locked portrait.
- [ ] Does anything make you miss landscape?

**Outcome:** keep the flag, or delete landscape. Deleting removes ~105
references across 13 files, including the transpose tests.

---

## Notes to bring back

Free text is more useful than ticks here.

- Which single change most improved a game?
- Which felt worse than before?
- Anything that looked like a bug (it may be an unexplained mechanic).
- Any moment you didn't know what to do next.
- Anything that stuttered, and roughly when.
