# Device test checklist — build v49

For a real phone, via **https://tiberiousdoom.github.io/Arcade/**. These are the
questions a desk cannot answer — thumb reach, legibility at real size, frame
rate, and whether the balance numbers are any good. Every item here was
reviewed only at a desk, through node-canvas or a desktop browser.

Rewritten 2026-10-13 for v49. The v22 checklist it replaces had sat for 27
builds; the items it asked about have since been answered in feedback rounds,
superseded by later builds, or carried forward below. When a section is
settled, record the outcome in STATUS.md and delete the section.

---

## 0. First: confirm you're on v49

The service worker serves cache-first, so a phone keeps running an old build
until the new worker takes over, and every observation below would then be
about the wrong code.

- [ ] Open any game's menu and check the bottom line reads **Arcade v49**.
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
      Circuit 5 entering from the top edge is the biggest untested guess.
- [ ] **The circuit picker** comes to about 690px against ~640px on a short
      phone, so it scrolls inside its panel with Back pinned. Usable?
- [ ] **Breaker's round** (`SLUG_SPEED`) — does it look heavy, or slow?
- [ ] **Tower prices climb** with every tower standing (~5.9x at 24). Felt as a
      decision, or as a wall?
- [ ] **Build on press**: tap a cell, slide off, and the tower is still placed.
      Has this ever cost you a tower by accident?
- [ ] **The armory** now costs ~24 Easy runs of kill income to fill (~15 for the
      four tracks anyone can buy). Does progress feel steady or grindy?

## 4. Choke Point — the win waves

- [ ] Easy is won at wave 50, Medium 100, Hard 150. How long does an Easy win
      take — twenty minutes, or an hour?

## 5. The whole app

- [ ] **Portrait-only.** In an installed app it stays locked portrait. In a
      browser tab, sideways gives a letterboxed portrait board — unavoidable
      there. Does anything make you miss landscape? (Deleting landscape is
      still on the table; see STATUS "Open decisions".)
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
