# Short Pipe — Design System

> **long-form in, captioned shorts out**

This is the design system for **Short Pipe**, a local-first desktop app that turns one
long-form video into a handful of strong, captioned vertical shorts. It exists so design
agents (and people) can produce on-brand Short Pipe interfaces, mockups, and marketing
without re-deriving the look every time.

---

## 1. Product context

**Short Pipe** is a **local-first macOS/desktop app (Electron + React)**. You point it at a
long-form video file; it transcribes locally, an agent proposes the best soundbites, you
review and trim them by word, and it renders 1080×1920 captioned clips — all on your own
machine.

The defining product values, in order:

1. **Local-first / private.** "Your video and transcripts never leave this machine." The
   source file stays on disk; nothing is uploaded. The only thing that leaves is the user's
   own Codex API calls.
2. **Bring-your-own-agent.** The agent runs on the user's **own Codex (ChatGPT) subscription**,
   so there is no inference cost from Short Pipe.
3. **Editorial, not "viral-tool".** The whole product is dressed as **paper and ink** — a
   warm newsprint canvas, serif headlines, a single vermillion accent. It reads like a
   well-made writing tool, deliberately *unlike* the neon gradient "AI clipper" genre.

### The pipeline (the spine of every screen)

```
Pick → Transcribe → Propose → Review / Trim → Render → Output
```

1. **Pick** a long-form video. It stays in place on disk.
2. **Transcribe** with local Whisper (via HyperFrames) → word-level timestamps.
3. **Propose** — the agent reads the transcript and proposes *ranked* soundbite candidates,
   following the bundled `shorts-from-longform` skill.
4. **Review & trim** — approve, reject, trim by words, swap layout and caption style.
5. **Render** — each approved short is rendered locally to 1080×1920.
6. **Output** - finished shorts are written to the user's default output folder, or to the project's own `output/` folder when no default is set.

### Core domain objects

- **Project** - one source video + its transcript + its candidates.
  Output uses the app default folder or the project's own `output/` folder.
- **Candidate** — a proposed soundbite: `title`, `rank`, an inclusive word-id range
  (`startWordId`→`endWordId`), `keywords`, and a `status` (`proposed` · `approved` ·
  `rejected` · `rendered`). In the repo a candidate also carries `layout`, `captionStyle`,
  `titleStyle`, `theme`, and `videoFit`; when the agent omits layout/theme/caption style,
  the app fills them from Settings defaults.
- **Transcript** — a flat list of words, each with `id` (`w0`, `w1`…), `text`, `start`, `end`.

### The rendering vocabularies (memorize these)

**Layout** (`LayoutKind`):
- `center-square` - a full-width video box centered on the page, with the title above it and captions below.
  This is the initial Settings default for talking-head / static / audio-led footage.
- `top-square` - a full-width video box pinned to the top of the page, with title and captions stacked below.
  Use when captions should carry the piece.
- `full-bleed` - source video fills the whole 1080×1920 frame (cropped), captions over the footage.
  For visually rich footage (faces, demos, motion).

**Video fit** (`VideoFit`):
- `full` - the whole source frame, uncropped, at its real aspect ratio.
  This is the default.
- `square` - cropped to a 1:1 square for tighter talking-head framing.

**Theme** (`Theme`):
- `dark` - ink page + warm off-white text.
  This is the initial Settings default.
- `light` - paper page + ink text for bright or busy footage.

**Caption style** (`CaptionStyle`):
- `clean` — calm, readable. 74px, weight 700. Corporate / explanatory / storytelling.
- `bold-pop` — 96px, weight 900, UPPERCASE, scale-pop entrance. Punchy / hype / social.
- `karaoke` — 82px, weight 800, words light up as spoken (35% → 100%). Fast, rhythmic, list-like.

In every caption style, **keyword** words are tinted vermillion (`#c7361f`) so they read
with the sound off.

### Sources used to build this system

- **GitHub:** [`github.com/kunchenguid/short-pipe`](https://github.com/kunchenguid/short-pipe)
  — the product repo. Explore it to go deeper:
  - `design/tokens/colors_and_type.css` — the canonical token file (ported here verbatim).
  - `src/renderer/src/styles/app.css` — the production component CSS (buttons, pills, cards).
  - `src/renderer/src/screens/` + `components/` — the real screens this UI kit revamps.
  - `src/main/media/composition.ts` — how a short is actually composited (layouts + caption
    styles as real CSS/JS). The single best reference for caption rendering.
  - `skills/shorts-from-longform/SKILL.md` — the agent's editorial logic (what makes a good
    short, ranking, layout/caption/keyword choices).

> **Note on the UI kit:** the repo owner asked us to treat the existing screen *layout and
> flow as a starting point only* and revamp it toward an ideal editing experience. So the
> `ui_kits/short-pipe/` recreation keeps the brand, tokens, copy voice, and rendering
> vocabulary **exactly**, but reorganizes the workspace into a focused three-pane editor
> (filmstrip · live 9:16 preview · inspector). Tokens and content rules are reused 1:1.
> Two deliberate UX upgrades over the original screens:
>
> 1. **Highlight-to-select trimming.** The original trim editor used an "active boundary +
>    click a word to move it" model, which is hard to reason about. We replaced it with
>    **highlight-to-select**: drag across the words you want — exactly like quoting a
>    passage — then drag either rounded handle (or use −/+) to nudge an edge. See the
>    "Body & transcript" card and the editor's Trim mode.
> 2. **Project-global style.** The UI kit keeps a single "Style · all shorts" bar as an intentional prototype simplification, while the production app stores layout, caption style, title style, theme, and video fit on each candidate.
>
> Note also: the status hues (`--ok`, `--caution`, `--danger`) were enriched a step from the
> raw repo values so the pills read confidently rather than washed-out, while staying in the
> warm editorial family. The exact values live in `colors_and_type.css`.

---

## 2. Content fundamentals

How Short Pipe writes. Match this voice in any new copy.

**Voice:** calm, plain, technical-but-human. It sounds like a thoughtful tool author, not a
growth marketer. No hype, no exclamation marks in body copy, no "🚀 supercharge".

**Person:** second person — **"you" / "your"**. The product refers to itself as "Short Pipe"
or "the agent", never "we". Actions the agent does are described plainly: *"It reads the
transcript on your Codex plan and proposes ranked soundbites."*

**Casing:** sentence case everywhere — headings, buttons, tile titles. The **only**
uppercase is (a) short UI section labels (`REVIEW QUEUE`) and (b) status pills (`PROPOSED`,
`READY`), both letter-spaced. Never title-case a sentence.

**Punctuation:** the house dash is a **spaced hyphen** ` - `, used where others would use an
em dash: *"Sign in once - your video and transcripts never leave this machine."* Mono is used
for anything machine-shaped: timecodes (`0:04 - 0:19`), durations (`14.2s`), word-ids, paths.

**Emoji:** **none.** Ever. Not in UI, not in marketing. This is a hard brand rule.

**Privacy is a feature, stated out loud.** Copy leans into local-first repeatedly:
*"It stays on your disk."*, *"never leave this machine."*

**Verbs are imperative and concrete:** Pick · Transcribe · Find shorts · Trim · Approve ·
Reject · Render · Re-render · Open output folder · Disconnect Codex. Buttons are verbs, not nouns.

**Examples to imitate (verbatim from the product):**

| Context | Copy |
|---|---|
| Tagline | *long-form in, captioned shorts out* |
| Auth | *Short Pipe runs the agent on your own Codex subscription. Sign in once - your video and transcripts never leave this machine.* |
| Empty library | *No projects yet. Pick a long-form video to begin - it stays on your disk.* |
| Agent runner | *Let the agent find your shorts* / *It reads the transcript on your Codex plan and proposes ranked soundbites into the review queue below.* |
| Empty queue | *No candidates yet. Once the video is transcribed, ask the agent to propose shorts.* |
| Trim hint | *Click any word to move it, or use - / + to extend by one word.* |
| Primary CTA | *New project from video* · *Transcribe & find shorts* · *Find shorts with AI* |

**Titles the agent writes for shorts** are viewer-facing *hooks*, sentence case, no quotes:
*"The real reason layoffs happen"*. Short, a claim or a question — never a description like
"Clip about layoffs".

---

## 3. Visual foundations

The system is **"paper and ink"**: a warm light editorial surface, near-black text, one hot
accent. It is intentionally the opposite of the cool, gradient, glassy "AI tool" look.

### Color
- **Surfaces are warm off-whites**, never pure white as the page: `--paper #faf9f5`
  (newsprint) is the app background; `--canvas-2 #ffffff` is reserved for raised cards and
  inputs; `--canvas #f3f3f0` for recessed wells/tracks. Topbars use `--paper-2`.
- **Text is warm near-black ink** in four steps: `--ink #16161a` → `--ink-2 #5a5750` →
  `--ink-3 #8b8678` (muted labels) → `--ink-4 #b8b2a2` (faint, e.g. the giant rank numerals).
- **One brand accent: vermillion `#c7361f`** — keywords, the accent/render button, active
  trim edges. Used sparingly; it is a spice, not a sauce.
- **Ultramarine `#1f3a7a`** is the quiet secondary — info banners and the `ready` state.
- **Dark frames** (`--frame #0f0e0c`) appear as the primary button, the rendered-short card
  background, and any "filmstrip"/video chrome. Text on them is warm cream `--ink-on-dark`.
- **Status has fixed color pairs** (text + wash): ok green, caution amber, ready ultramarine,
  failed/danger vermillion, mute grey. See `preview/colors-status.html`.

### Type
- **Display = DM Serif Display** (regular only) — app title, screen headings, the big rank
  numerals. Tight tracking (-0.2 to -0.4px). This is the brand's literary voice.
- **Body / reading = Newsreader** — candidate titles, the transcript manuscript (17px,
  line-height ~2.0 so words are clickable), reasons.
- **UI = Inter** — every control, label, meta line, status pill. 12–14px.
- **Mono = JetBrains Mono** — timecodes, durations, word-ids, file paths. Tabular numerals.
- **Caption = Outfit** (800–900) — *only* inside rendered 1080×1920 shorts, never in the app
  chrome. It is the loud display face for the actual video output.

### Spacing, radius, elevation
- **4px spacing scale** (`--space-1`…`--space-8` = 4→40). Generous but not airy; the app is
  information-dense in a calm way.
- **Radii are small and editorial:** 2px (word chips), 4px (buttons/inputs), 8px (cards/wells),
  12px (large panels), pill (status + keyword chips). The rendered *card layout* uses a larger
  28px radius for the video — that is output, not chrome.
- **Shadows are warm, low, and rare.** Built on `rgba(15,14,12,…)` (ink), never cool/blue.
  Chrome mostly uses **hairline borders** (`--line`, `--line-strong`) instead of shadow;
  real elevation is saved for the 9:16 card preview (`--shadow-card`).

### Borders vs. shadows
This is a **border-led** system. Cards, inputs, bars, and tiles are defined by 1px hairlines
on warm surfaces; hover often *darkens the border* (`--line` → `--line-strong`) rather than
adding shadow. Reserve shadow for things that should feel physically lifted off the page —
chiefly the rendered short.

### Motion
- One easing curve everywhere: `--ease cubic-bezier(0.2, 0.7, 0.2, 1)` (a soft, confident
  decelerate). Three durations: 120ms (hover/press), 220ms (enter/leave), 480ms (deliberate).
- **No bounce in the app chrome.** The only spring (`back.out(1.7)`) lives inside the
  `bold-pop` caption entrance — i.e. in the *output*, where energy is the point. App
  transitions are fades and short slides; nothing decorative loops.
- **Hover** = surface lightens (`--canvas-hover`) or border darkens. **Press** = surface
  darkens one more step (`--canvas-press`); no scale-shrink in chrome.
- Spinner: a 12px ring, `--line-strong` track with an `--ink-2` head, 0.7s linear.

### Imagery
The app ships **no illustration and no photography** of its own — the "imagery" is the user's
own video frames, shown either full-bleed (cropped, cool/neutral, as filmed) or inside a
square-layout video box.
There are no stock photos, no gradients-as-decoration, no 3D blobs.
When a video
poster is unavailable in a mock, use a neutral charcoal frame (`--frame`), not a colored
placeholder.

### What to avoid (off-brand)
Bluish-purple gradients · glassmorphism / heavy blur · emoji · rounded cards with a single
colored left border · neon · drop-shadowed "floating" everything · title case · pure-white
page backgrounds · cool-grey shadows.

---

## 4. Iconography

**The product uses icons sparingly** - most actions are still *words* ("Transcribe",
"Approve", "Open output folder"), status is *pills*, and the giant serif **rank numerals**
(1, 2, 3) are the closest thing to an icon.
The settings gear and folder action are the main icon-supported controls.

For the revamped UI kit we introduce a **restrained, thin-stroke line-icon set** only where a
glyph genuinely beats a word (filmstrip controls, the transcribe/render/output rail, a play
affordance on the preview). We use **[Lucide](https://lucide.dev)** (1.75px stroke, rounded
caps) loaded from CDN — it matches the calm editorial weight far better than filled or duotone
sets.

> ⚠️ **Substitution flag:** Lucide is *our* choice — the Short Pipe repo contains no icon font,
> SVG set, or sprite. If the team has (or wants) a specific icon set, tell us and we'll swap it
> in. Until then: thin line icons, `--ink-2`/`--ink-3` by default, vermillion only when active,
> sized to the optical line of adjacent text (16–18px), never as the primary signifier of an
> action.

Rules:
- Icons **support** a label; they rarely stand alone.
  Approve/Reject/Render keep their words.
  The settings gear is an intentional topbar icon-only exception.
- **No emoji, ever**, including as icons.
- Mono digits and the serif rank numerals do real iconographic work — lean on them.

---

## 5. Index / manifest

Root files:

| File | What it is |
|---|---|
| `README.md` | This document. |
| `colors_and_type.css` | The token source of truth — color, type, spacing, radius, shadow, motion vars + semantic type classes. Import this first in any build. |
| `SKILL.md` | Agent Skills entry point — makes this folder usable as a downloadable Claude skill. |
| `fonts/` | Note on the (Google-hosted) font stack. |
| `assets/` | Brand marks and any copied visual assets. |
| `preview/` | Small HTML specimen cards that populate the Design System tab (colors, type, spacing, components, brand). |
| `ui_kits/short-pipe/` | The high-fidelity, revamped product recreation — `index.html` (clickable prototype) + JSX components. |

UI kits:
- **`ui_kits/short-pipe/`** — the desktop app: Connect → Library → three-pane Editor
  (filmstrip · live 9:16 preview with real caption styles · inspector) → Transcript trim.
  See its own `README.md` for the component list.

No slide template was provided in the source repo, so no `slides/` were produced.
