# shared/fonts/

Self-hosted webfonts. Previously loaded from the Google Fonts CDN, which meant
the games could not render correctly offline — a blocker for the PWA goal, since
offline operation is the whole point of a service worker.

| File | Family | Weights | Size |
|---|---|---|---|
| `chivo-mono-latin.woff2` | Chivo Mono | 300–700 (variable) | ~26 KB |
| `archivo-black-latin.woff2` | Archivo Black | 400 | ~18 KB |

## Provenance

Downloaded from `fonts.gstatic.com`, the URLs taken from the Google Fonts CSS
API response for the families and weights the shells actually use. Both are the
**`latin` subset only** — matching what the CDN was already serving for this
content. Characters outside that subset (`←` `→` `◀` `▶` `✸` `◈`) fell back to a
system font before this change and still do; nothing regressed.

Chivo Mono is a variable font, so the single file covers all four weights the
shells request (300/400/600/700) rather than needing four static files.

## Licensing

Both fonts are under the SIL Open Font License 1.1, which expressly permits
self-hosting and redistribution. The full license text ships alongside them, as
the OFL requires:

- [`OFL-ChivoMono.txt`](OFL-ChivoMono.txt) — Copyright 2019 The Chivo Project Authors
- [`OFL-ArchivoBlack.txt`](OFL-ArchivoBlack.txt) — Copyright 2017 The Archivo Black Project Authors

## Updating

`@font-face` rules live in [`../theme.css`](../theme.css). If you replace or add
a font file, re-run `node games/serpent-battery/build.mjs` — the standalone build
embeds these as base64 data URIs, and its embedder throws rather than silently
shipping a build that renders in a fallback face.
