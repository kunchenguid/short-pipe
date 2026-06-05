---
name: shorts-from-longform
description: Turn a long-form video transcript into ranked, captioned vertical shorts. Use when proposing soundbite candidates, choosing a layout and caption style, and selecting keywords to emphasize in a Short Pipe project.
---

# Shorts from long-form

You turn one long-form video into a ranked set of strong vertical shorts.
The video is already on disk and, once transcribed, `transcript.json` in the project folder holds every word with a `start`, `end`, and an `id` like `w0`, `w1`.
Your job is to read that transcript, find the moments worth clipping, and propose them through the `propose_candidates` tool.

## Workflow

1. If you do not yet know the source dimensions, call `probe`.
2. If `transcript.json` does not exist yet, call `transcribe`. For known-English audio use a `.en` model; otherwise pass `model: "small"` so Whisper auto-detects.
3. Read `transcript.json` with the `read` tool. Read the whole thing before choosing - the best shorts are rarely at the very start.
4. Select and rank the strongest moments, then call `propose_candidates` once with the full ranked list.
5. Tell the user how many you proposed and invite them to review, trim, and approve. Do not render anything until the user approves it.

## What makes a good short

A short is one self-contained idea a stranger can drop into and immediately get.

- **Self-contained.** It must make sense with zero setup. No dangling "as I said before" or "that's why".
- **Length.** Aim for 15-45 seconds of speech. Shorter than ~10s feels thin; longer than ~60s loses people.
- **Starts on a hook.** Begin on a sentence that creates a question or a claim, not on filler ("So, um, yeah").
- **Ends on a landing.** End on the completed thought or punchline, not mid-sentence. Prefer ending right after a `.`, `!`, or `?` word.
- **Ends where the speaker pauses.** Prefer an `endWordId` that is followed by a real beat of silence - a clear gap before the next word's `start`. The renderer snaps clip boundaries to actual pauses in the audio, so a landing the speaker rushes past (no gap to the next word) gets cut tight no matter what. A period in the transcript does not guarantee a pause; check the timing gap, not just the punctuation. Same for the start: prefer a `startWordId` preceded by a gap.
- **One idea.** If two ideas are fighting inside a clip, split them into two candidates.

Pick the word range by `id`: `startWordId` is the first word of the hook, `endWordId` is the last word of the landing (inclusive).
Use real word ids from the transcript - never invent timings.
A real pause before the start and after the end (a visible gap between one word's `end` and the next word's `start`) makes a far cleaner cut than a tight, gapless boundary.

## Ranking

Rank best-first, starting at `rank: 1`.
Rank on: strength of the hook, emotional or informational payoff, and how well it stands alone.
Propose only genuinely strong moments.
Treat the requested count as the target number of strong clips to find, not a reason to pad with weak moments.
The app defaults that count to roughly one short per minute of source video, with a floor of two and no upper cap.
Three excellent candidates still beat ten mediocre ones - a long list of weak clips wastes the user's review time.

## Layout

- `full-bleed` - the source video fills the whole 1080x1920 frame (cropped). Use when the source is already visually interesting (a face, a demo, motion).
- `top-square` - a full-width square crop of the video pinned to the top of an editorial paper page, with the title and captions stacked in the open space below. Use when the speaker is visually secondary and the roomy lower half should let captions carry the piece.
- `center-square` - a full-width square crop centered on the paper page, the title above it and captions below. The default for talking-head audio-led content: balanced, composed, and strong for a single quote or calm explainer.

When unsure, prefer `center-square` for talking-head audio-led content and `full-bleed` for visually rich footage.
Both square layouts show a static title, so give every candidate a short, punchy `title` - it appears on the page, not just in the app.

On the square layouts, `videoFit` controls how the video fills its box:

- `square` - cropped to a 1:1 square. Best for talking heads, where the center of frame is all that matters.
- `full` - the whole source frame, uncropped, at its real aspect ratio. The default, and best when the framing carries information that cropping would cut off - a chart, a screen share, a wide shot, on-screen text. The box resizes to the source aspect and the title/captions sit below it.

## Title style

On the square layouts the title is a headline set in an editorial serif. Pick a `titleStyle` for how it is dressed (ignored by `full-bleed`, which shows no title):

- `kicker` - a short vermillion rule above the headline. The default; clean and works at any title length.
- `plain` - the serif headline on its own, no accent. Use for a quiet, understated look.
- `masthead` - an italic headline flanked by thin rules. A composed, magazine-masthead feel.
- `eyebrow` - the clip's top keyword set as a small uppercase label above the headline. The most magazine-like; pick it when the keyword adds context the title doesn't already state (avoid it when the keyword just repeats a word in the title).

## Theme

`theme` is an orthogonal color polarity applied across every layout, caption, and title style:

- `light` - paper page, ink text; full-bleed captions are dark on a light scrim. Best over bright or busy footage (charts, slides, daylight).
- `dark` - ink page, warm off-white text; full-bleed captions are light on a dark scrim. The default, and best over dark or cinematic footage, or for a moodier feel.

Pick the theme that contrasts with the footage: `light` when the video is bright, `dark` when it is dark. Full-bleed captions always get a stroke and a scrim, so either theme stays readable; the theme just sets which polarity.

## Caption style

Match the tone you hear in the transcript.

- `clean` - calm, readable. Corporate, explanatory, or storytelling content.
- `bold-pop` - large, uppercase, scale-pop entrance. Punchy, high-energy, hype, or social content.
- `karaoke` - words light up as they are spoken. Good for fast, rhythmic, list-like delivery.

## Keywords

Pass 1-4 `keywords` per candidate: the load-bearing words a viewer should catch even with the sound off - a number, a name, a verb that carries the point.
Keywords are emphasized in the captions, so do not mark every word - pick the few that matter.

## Calling propose_candidates

Each candidate needs: `title` (a short viewer-facing hook), `rank`, `startWordId`, `endWordId`, and ideally `reason`, `layout`, `captionStyle`, and `keywords`.
`propose_candidates` replaces any previous proposals for the project, so always submit the complete ranked list in one call.
