# Fonts

Short Pipe's type stack is **loaded from Google Fonts** — the product repo ships no font
files of its own (it relies on the same Google/system stack). `colors_and_type.css` contains
the `@import` for all five families, so importing that file is all you need.

| Role | Family | Weights used | Google Fonts |
|---|---|---|---|
| Display (titles, ranks) | **DM Serif Display** | 400 (+ italic) | ✓ |
| Body / reading | **Newsreader** | 400 / 500 / 600 (+ italic) | ✓ |
| UI / controls | **Inter** | 400 / 500 / 600 / 700 | ✓ |
| Rendered-short captions | **Outfit** | 500 / 700 / 800 / 900 | ✓ |
| Mono (timecodes, ids, paths) | **JetBrains Mono** | 400 / 500 / 600 | ✓ |

Fallback stacks (already in the tokens) cover offline / restricted environments:
DM Serif → GT Sectra → Tiempos Headline → Georgia; Newsreader → Iowan Old Style → Georgia;
Inter → system-ui; Outfit → Inter → system-ui; JetBrains Mono → Berkeley/IBM Plex Mono → ui-mono.

> If you need **offline, self-hosted** `.woff2` files (e.g. for a packaged build or PDF
> export), tell us and we'll vendor them into this folder and switch the `@import` to local
> `@font-face` rules. They are not committed here to keep the repo light.
