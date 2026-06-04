# Short Pipe — UI kit

A high-fidelity, interactive recreation of the Short Pipe desktop app, built to be pieced
together for mockups and prototypes. It keeps the brand, tokens, copy voice, and rendering
vocabulary of the product **exactly**, while revamping the workspace layout and trim
interaction toward an ideal editing experience (see the design-system README §1 for the
rationale and the two UX upgrades).

## Run it

Open `index.html`. It's a clickable prototype with fake state:

**Connect Codex** → **Library** (project gallery + dropzone) → **Editor**. In the editor you
can select shorts in the filmstrip, flip the project-global **Style · all shorts** bar
(layout + caption) and watch every clip + the live 9:16 preview update, edit keywords, play
the preview, **Trim by words** (highlight-to-select), and **Approve → Render**. Opening an
un-transcribed project (the dropzone or "Podcast ep. 47") runs the agent flow that proposes
shorts into the filmstrip.

## Files

| File | What it is |
|---|---|
| `index.html` | Entry point. Loads React 18 + Babel, `tokens.css`, `kit.css`, then `data.jsx` + `screens.jsx`. |
| `screen-auth.html` · `screen-library.html` · `screen-editor.html` · `screen-trim.html` | **Full-screen previews** — the same app deep-linked to one composed screen via `window.__SP_INITIAL`. Use these to see how the components fit together at full size. |
| `tokens.css` | A copy of the root `colors_and_type.css` so the kit is self-contained. |
| `kit.css` | Component + layout CSS (buttons, pills, three-pane editor shell, trim, style bar). Ports `src/renderer/src/styles/app.css` and extends it. |
| `data.jsx` | Fake data + shared primitives: the `Icon` set (real Lucide path data), `Pill`, `Spinner`, a word-level `TRANSCRIPT`, `CANDIDATES`, `PROJECTS`. Exposed on `window`. |
| `screens.jsx` | All components + the `App`. Mounts to `#root`. |

## Components (in `screens.jsx`)

- **`App`** — top-level shell + screen routing (`auth` / `library` / `editor`) + the topbar wordmark.
- **`AuthGate`** — the Connect Codex screen.
- **`Library`** / **`ProjectTile`** — project gallery with poster thumbnails, status pills, and a drop-zone.
- **`Editor`** — the three-pane workspace (source bar + global style bar + filmstrip / stage / inspector).
- **`StyleBar`** — the project-global Layout + Caption controls ("Style · all shorts").
- **`Filmstrip`** / **`Clip`** — left rail of candidate shorts as 9:16 posters with rank, mini-caption, status, timecode.
- **`StagePreview`** / **`CaptionLine`** — the centre live 9:16 preview that renders the real `clean` / `karaoke` / `bold-pop` caption styles over `card` / `full-bleed` layouts, with a play scrubber.
- **`Inspector`** — per-candidate panel: proposed **passage**, meta, keyword editor, Trim, Approve / Reject / Render.
- **`TranscriptTrim`** — the highlight-to-select word range editor (drag to select, drag handles to nudge, ± steppers).
- **`AgentEmpty`** — the "Let the agent find your shorts" empty/running state.

## What's intentionally faked

This is a cosmetic recreation, not the product. There is no real Whisper, no HyperFrames
render, no Codex auth, no file system — the video preview is a neutral charcoal placeholder
(the product shows the user's own frames), the agent "run" is a scripted progress line, and
all data lives in `data.jsx`. Components are simplified, mainly-cosmetic versions of the real
ones; the goal is pixel-level visual fidelity and interaction feel, not production logic.

## Icons

Icons use **real [Lucide](https://lucide.dev) path data** inlined in `data.jsx` (`Icon`
component) — the product ships no icon set, so this is our documented substitution (design-system
README §4). Swap the path map if the team adopts a specific set.
