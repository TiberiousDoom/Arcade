# Arcade

A small collection of HTML5 canvas arcade games. No frameworks, no bundler, no
build step — just files a browser can load. Everything runs offline, and there
are no accounts, ads, tracking, or network calls of any kind.

**Play:** https://tiberiousdoom.github.io/Arcade/

| Game | What it is |
|---|---|
| **Serpent Battery** | A chain of segments crawls a serpentine path toward your guns. Cut it mid-chain to force recoil, bank hits into Overdrive, spend scrap on the battery between waves. |
| **Angle Iron** | A brick-breaker where the paddle is your aim: where the ball lands across it decides the angle it leaves. Back rows take three hits. |
| **Live Wire** | A lengthening wire on a grid. Longer and faster with every meal; you may cross where your tail is leaving, and the gold bonus won't wait. |

Installable to a phone home screen (it's a PWA) and playable with touch,
mouse, or keyboard, in portrait or landscape.

## Running it locally

The games load `engine.js` as an ES module, which browsers refuse to do over
`file://` — so serve the directory rather than opening the HTML directly:

```bash
python -m http.server 8123
```

Then open http://localhost:8123/.

## Tests

The game logic lives in pure `engine.js` modules with no DOM, canvas, timers,
or (mostly) randomness, which makes it directly unit-testable:

```bash
node --test games/*/engine.test.js
```

There's also a render smoke test that boots the real game in jsdom and drives
a few frames, catching draw-path crashes the logic tests can't see. It needs
two dependencies that aren't otherwise required:

```bash
npm install --no-save jsdom canvas
node --test games/serpent-battery/render-test.mjs
```

## Layout

```
index.html          the cabinet — links to each game
manifest.webmanifest, sw.js    PWA: installable, offline
games/<name>/       engine.js (pure logic) + a shell (rendering, input, loop)
shared/             theme, fit-to-screen, particles, fonts, icons
docs/DECISIONS.md   why things are the way they are
STATUS.md           what's done and what's next
```

Each game splits into a pure-logic engine and a thin shell that owns
rendering, input, and the frame loop. [CLAUDE.md](CLAUDE.md) documents the
architecture in detail.

## License

Code is unlicensed at present — ask if you want to reuse it. The bundled fonts
(Chivo Mono, Archivo Black) are SIL Open Font License 1.1; see
[shared/fonts/](shared/fonts/).
