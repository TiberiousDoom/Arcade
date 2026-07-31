# Device test checklist — build v17

For a real phone, via **https://tiberiousdoom.github.io/Arcade/**. Everything
below was built and verified in an emulator only; the point of this pass is the
things an emulator cannot tell us — thumb reach, legibility at real size, frame
rate, and whether the difficulty numbers are any good.

Updated 2026-07-30 for build v17. When a section is settled, record the outcome
in STATUS.md's open decisions and delete the section rather than leaving it to
rot.

**Already settled, do not re-test:** Serpent Battery's aim (confirmed good on
device, `AIM_ASSIST_R` 9 / `TRAVERSE_MAX` 5.6 stand), and Live Wire's food
visibility (fixed in v16, confirmed).

---

## 0. First: confirm you're actually on v17

The service worker serves cache-first, so a phone will happily keep running an
old build and every symptom below would then be meaningless.

- [ ] Open any game, tap **?**, and check the bottom line reads **Arcade v17**.
      (Or the cabinet footer.)
- [ ] If it doesn't: fully close the app, reopen, and reload once more. First
      load installs the new worker, second reads from it.

**Do not test anything else until this reads v17.**

---

## 1. Circuit Breaker — the new art (v17)

Taken onto the vector look most conservatively of all the games, because its
enemy trait cues depend on crisp silhouettes. **This is the section I'd most
like results from.**

- [ ] **Do the enemy trait cues still read at real size?** Heavy ring = Shell
      (plated), dashed shell + chevron = Phase (shrugs off splash, can't be
      slowed), cross = Patch (heals others). If these have gone mushy now that
      everything glows, the art has cost more than it gained.
- [ ] A *slowed* enemy (pale blue frost) must still be distinguishable from a
      *Shell* (blue, heavy ring). These call for opposite responses.
- [ ] **Frame rate on a busy wave** — wave 12+ puts 70+ enemies on screen, each
      now with extra glow passes. Any stutter?
- [ ] Beams: tower-coloured with a white-hot core and a flare at the impact
      point. Does a hit register visibly even when the target survives?
- [ ] Is the circuit path too *dim* now? It was deliberately pushed quiet and
      may have been overcorrected.
- [ ] Towers should read as solid objects with thickness, not hollow rings.

## 2. Circuit Breaker — depth (still outstanding from v11)

Never yet reported on. Needs a run to **at least wave 11**.

- [ ] HUD shows **Circuit A/B/C**, and losing → Play again gives a **different
      letter and a visibly different board**.
- [ ] Wave 4 **Swarm** — tight burst of small fast ones. Does Breaker's splash
      visibly pay off?
- [ ] Wave 7 **Shell** — do Nodes visibly struggle where a Breaker doesn't? Is
      *upgrading* a Node a viable answer, or does it feel hopeless?
- [ ] Wave 9 **Phase** — Coil should be visibly useless against it.
- [ ] Wave 11 **Patch** — is it obvious something is being repaired, and that
      the Patch is the cause?
- [ ] **Does Coil now feel worth building?** `SLOW_BRITTLE` is ×1.4 and was a
      guess. Most valuable single number to get a read on.
- [ ] Is it still too easy? Where does it stop being winnable?
- [ ] Are waves 1–3 now *boring*? Nothing was changed there deliberately.
- [ ] Tapping a cell builds on the cell you *meant* (~45px targets).
- [ ] Upgrade popup stays open after Upgrade; outside tap closes it.
- [ ] Rotate mid-run: towers stay put and none end up on the path.

## 3. Mid-run saves (new in v12/v13)

Circuit Breaker, Serpent Battery and Angle Iron only. Live Wire is deliberately
excluded — it's one-life score-attack.

- [ ] Start a run, get a few waves/levels in, then **switch apps** (don't just
      lock the screen). Come back: you should be offered **Resume run?** with
      **Continue** and **New run**.
- [ ] **Continue** puts you back where you were — score, wave/level, towers,
      lives, brick damage.
- [ ] **New run** starts fresh and the offer doesn't come back.
- [ ] Finish a run properly (game over). You should **not** be offered a resume
      afterwards.
- [ ] Repeat for all three games.

## 4. Serpent Battery — difficulty rework (still outstanding from v11)

Aim is settled; this is about the difficulty changes.

- [ ] **Wave 1 should now feel gentle** — all standard segments, where it used
      to contain six kinds at once. Too gentle?
- [ ] Kinds arrive one at a time: carrier 2, armored 3, volatile 4, shielded 5,
      regen 7, splitter 9. Does each get a beat to be understood?
- [ ] Late waves should feel *chewy*, not merely *long* (hp now scales).
- [ ] **The head's ring** thins as you clear the body behind it. Without reading
      the help text, is it obvious that means "protected"?
- [ ] Shots on a protected head flash white and barely scratch it. Does that
      read as *armoured* or as *broken*?
- [ ] **Killing the head kills the whole serpent.** Does that land as a payoff?
- [ ] Try an early decapitation with overdrive or a rail gun — tempting, or
      obviously never worth it?
- [ ] Shop: buttons are 42px, chips 34px. Comfortable? Does "40 · need 15 more"
      read clearly, and look different from "Maxed"?
- [ ] HUD: values are larger and labels smaller. Easier to read mid-fight?

## 5. Angle Iron — powerups (still outstanding from v11)

- [ ] Capsules drop from bricks and are catchable with the paddle.
- [ ] Glyphs legible at phone size: **3** split · **↔** wide · **▼** slow ·
      **+** spare.
- [ ] Each does what it says; effect timer bars sit above the floor line and
      don't collide with the audio button.
- [ ] Drop rate (~1 brick in 7) — treat or torrent?
- [ ] Does multiball become fun or chaos?

## 6. Live Wire — the art pilot (v14–v16)

Mostly confirmed already; only the leftovers.

- [ ] Phosphor trails: pleasant, or distracting during fast play?
- [ ] Frame rate — this is the game with trails, so the most likely to stutter.
- [ ] Are the scanlines noticeable at all on a phone? If not, they can go.

## 7. Portrait-only — the decision

The flag is reversible; this pass decides whether landscape gets deleted.

- [ ] Turn the phone sideways **in a browser tab** (not installed). You'll get a
      letterboxed portrait board — unavoidable in a tab. Tolerable?
- [ ] Installed to the home screen, it should stay locked portrait.
- [ ] Does anything make you miss landscape?

**Outcome:** keep the flag / delete landscape for good. Deleting removes ~105
references across 13 files, including the transpose tests.

---

## Notes to bring back

Free text is more useful than ticks here.

- Which single change most improved a game?
- Which felt worse than before?
- Anything that looked like a bug (it may be an unexplained mechanic).
- Any moment you didn't know what to do next.
- Anything that stuttered, and roughly when.
