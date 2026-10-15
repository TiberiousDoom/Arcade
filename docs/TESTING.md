# Device test checklist — build v55

For a real phone, via **https://tiberiousdoom.github.io/Arcade/**. These are the
questions a desk cannot answer — thumb reach, legibility at real size, frame
rate, and whether the balance numbers are any good. Every item here was
reviewed only at a desk, through node-canvas or a desktop browser.

Rewritten 2026-10-13 for v49, updated for v55. The v22 checklist it replaces had sat for 27
builds; the items it asked about have since been answered in feedback rounds,
superseded by later builds, or carried forward below. When a section is
settled, record the outcome in STATUS.md and delete the section.

---

## 0. First: confirm you're on v55

The service worker serves cache-first, so a phone keeps running an old build
until the new worker takes over, and every observation below would then be
about the wrong code.

- [ ] Open any game's menu and check the bottom line reads **Arcade v55**.
- [ ] If it doesn't: fully close the app, reopen, and reload once more. The
      first load installs the new worker, the second reads from it.

---

## 1. Flak Battery — the v49 guns

All five guns were redrawn from the bench (DECISIONS 2026-09-25).

- [ ] **The ion's purple** (`#a56cff`) sits near the regen craft's `#8f5fb8`
      and the Ricochet crate's `#b98de0`. Different shapes, different row —
      but do they ever get confused at a glance?
- [ ] **Three barrels at the real offsets** sit wide, most on the mortar and
      the ion. Does each still read as one gun?
- [ ] **Six mounts in portrait.** Spacing is 84px and the towed legs span ~74px;
      the leftmost pad reaches the board edge. Crowded, or fine?
- [ ] **Refit (v50)**: on a save with only the standard cannon, the Refit
      card has no gun-swap row at all; once another gun is researched, the row
      lists only researched guns.
- [ ] Shop portraits render at about a third of bench scale. Can you tell the
      five guns apart on the card?

## 2. Flak Battery — the deep game

Nobody has reported from these waves on glass.

- [ ] **The swarm escort** starts at wave 30 and is at full density at 60
      (`SWARM_WAVE`, `SWARM_MAX`, `SWARM_HP_EVERY`). Is 30 the right start?
- [ ] **The research ladder**, a rung every ten waves up to Ion at 70. Do the
      rungs land in the right order, and is 70 too far out to matter?
- [ ] **The shop's DPS figure** leaves heat out on purpose. Does it read as
      "sustained", or as a promise the gun doesn't keep?
- [ ] **Frame rate with five or six mounts at deep tiers** — the shot glow is
      fill-rate bound and DPR 3 pushes several times the pixels a desk does.

## 3. Choke Point — the replay rewards and the late board

- [ ] **Sever** (earned on Medium): worth a slot on a crowded board at all?
- [ ] **The Chain and Veterancy tracks**, and `MARK_BRITTLE`/`CHAIN_EVERY` —
      all measured, none played.
- [ ] **Circuits 4 and 5** get their difficulty from *shape*, not just length.
      Circuit 5 entering from the side is the biggest untested guess.
- [ ] **The circuit picker** comes to about 690px against ~640px on a short
      phone, so it scrolls inside its panel with Back pinned. Usable?
- [ ] **Breaker's round** (`SLUG_SPEED`) — does it look heavy, or slow?
- [ ] **Tower prices climb** with every tower standing (~5.9x at 24). Felt as a
      decision, or as a wall?
- [ ] **Build on release (v50)**: tap a cell and a tower appears when you let
      go. Press a cell, slide off, let go — nothing should be built. Does the
      wait for the release ever feel laggy?
- [ ] **The armory** now costs ~24 Easy runs of kill income to fill (~15 for the
      four tracks anyone can buy). Does progress feel steady or grindy?

## 3a. Airburst — still open after round 20

Round 20 settled the crosshair, firing on release, slide-off cancel, the split
warning, the wave-5 curve, the ammunition display and legibility (outcomes in
STATUS). Still to judge:

- [ ] **Sound (v55, re-voiced).** In v54 only a city being hit was audible.
      Now: launch, burst, catch, split and an empty battery should all come
      through a phone speaker. Do they, and is the burst too frequent to be
      pleasant?
- [ ] **Past wave 5.** Roughly where does it start to get hard?
- [ ] **Frame rate** on a late wave with many trails and bursts.

## 3b. Choke Point — the opening ramp (v52)

Best judged as a new player: clear the site data for the Pages URL first
(this also clears your armory and wins), or ask someone who has never played.

- [ ] A first run offers **Node only**; Breaker and Coil are on the palette,
      dimmed, saying "Reach wave 3" / "Reach wave 8".
- [ ] At **wave 3** Breaker opens mid-run with "Breaker unlocked" at the top of
      the board. Is the notice noticeable without being in the way?
- [ ] Does Breaker arriving a wave before Swarm feel like being handed the
      answer in time, or like too little time to learn it?
- [ ] On the **second run**, Range and Splash are in the armory.
- [ ] On your own phone without clearing anything: nothing you had is locked.

## 4. Choke Point — the win waves

- [ ] Easy is won at wave 50, Medium 100, Hard 150. How long does an Easy win
      take — twenty minutes, or an hour?

## 5. The whole app

- [ ] **Portrait only (v51).** Nothing should look or play differently from
      v50 in any game. Turn the phone sideways in a browser tab: the board
      stays upright and letterboxed, and no "Turned" banner appears.
- [ ] **The two cabinets.** Is the crosslink between them findable, or does it
      read as a footer nobody taps?
- [ ] **Slide-off cancels** (v47): press a button, drag off, let go — nothing
      should happen, in all four games.

---

## Notes to bring back

Free text is more useful than ticks here.

- Which single change most improved a game?
- Which felt worse than before?
- Anything that looked like a bug (it may be an unexplained mechanic).
- Any moment you didn't know what to do next.
- Anything that stuttered, and roughly when.
