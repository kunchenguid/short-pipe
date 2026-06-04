---
name: short-pipe-design
description: Use this skill to generate well-branded interfaces and assets for Short Pipe, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and
create static HTML files for the user to view. If working on production code, you can copy
assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or
design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_
production code, depending on the need.

## Quick map

- `README.md` — product context, content fundamentals, visual foundations, iconography, manifest.
- `colors_and_type.css` — the token source of truth (color, type, spacing, radius, shadow,
  motion + semantic type classes). Import this first in any build.
- `fonts/` — the (Google-hosted) font stack and fallbacks.
- `preview/` — small specimen cards for every foundation + component.
- `ui_kits/short-pipe/` — the interactive product recreation; lift components from `screens.jsx`.

## The one-paragraph brief

Short Pipe is a **local-first** desktop app that turns long-form video into captioned vertical
shorts, run on the user's **own Codex** subscription. Dress everything as **"paper and ink"**:
warm newsprint surfaces (`--paper`), warm near-black text, a single **vermillion** (`#c7361f`)
accent, **DM Serif Display** headlines + **Newsreader** reading text + **Inter** UI +
**JetBrains Mono** machine text. Sentence case; the house dash is a spaced hyphen ` - `; **no
emoji, ever**; privacy stated out loud. Border-led surfaces, warm low shadows, one easing
curve, fades not bounces (the only spring lives inside the rendered captions). When in doubt,
make it calmer and more editorial than you think.
