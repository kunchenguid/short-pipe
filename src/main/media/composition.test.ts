import type { TranscriptWord } from "@shared/project";
import { describe, expect, it } from "vitest";
import {
  buildPreviewDocument,
  buildShortComposition,
  CLIP_LEAD_IN,
  CLIP_LEAD_OUT,
  clipWindow,
  paddedClipWindow,
  parseByteRange,
  selectCaptionGroups,
} from "./composition";

const words: TranscriptWord[] = [
  { id: "w0", text: "The", start: 10.0, end: 10.2 },
  { id: "w1", text: "real", start: 10.2, end: 10.5 },
  { id: "w2", text: "reason", start: 10.5, end: 11.0 },
  { id: "w3", text: "is", start: 11.0, end: 11.2 },
  { id: "w4", text: "money.", start: 11.2, end: 11.8 },
  { id: "w5", text: "Stop", start: 12.5, end: 12.9 },
  { id: "w6", text: "blaming", start: 12.9, end: 13.4 },
  { id: "w7", text: "yourself.", start: 13.4, end: 14.0 },
];

describe("selectCaptionGroups", () => {
  it("rebases timing to clip-local and keeps groups within range", () => {
    const groups = selectCaptionGroups(words, 10, 14, ["money"]);
    expect(groups[0].words[0].start).toBe(0);
    for (const g of groups) {
      expect(g.start).toBeGreaterThanOrEqual(0);
      expect(g.end).toBeLessThanOrEqual(4);
    }
  });

  it("breaks groups on sentence-ending punctuation", () => {
    const groups = selectCaptionGroups(words, 10, 14);
    // "...money." ends the first sentence; "Stop blaming yourself." is separate.
    const texts = groups.map((g) => g.words.map((w) => w.text).join(" "));
    expect(texts.some((t) => t.endsWith("money."))).toBe(true);
    expect(texts.some((t) => t.startsWith("Stop"))).toBe(true);
  });

  it("marks keyword words", () => {
    const groups = selectCaptionGroups(words, 10, 14, ["money"]);
    const moneyWord = groups.flatMap((g) => g.words).find((w) => w.text === "money.");
    expect(moneyWord?.keyword).toBe(true);
  });

  it("only includes words overlapping the range", () => {
    const groups = selectCaptionGroups(words, 12.5, 14);
    const allText = groups.flatMap((g) => g.words.map((w) => w.text));
    expect(allText).toEqual(["Stop", "blaming", "yourself."]);
  });
});

describe("buildShortComposition", () => {
  const candidate = {
    startTime: 10,
    endTime: 14,
    layout: "top-square" as const,
    captionStyle: "clean" as const,
    keywords: ["money"],
    title: "The real reason",
  };

  it("produces a 1080x1920 portrait composition with a trimmed source and audio", () => {
    const html = buildShortComposition({ sourceFileName: "source.mp4", candidate, words });
    expect(html).toContain('data-resolution="portrait"');
    expect(html).toContain('data-width="1080"');
    expect(html).toContain('data-height="1920"');
    // 4-second word range, padded by 0.24s lead-in/out: starts at 9.76,
    // ends 0.24s late -> 4.48s of media.
    expect(html).toContain('data-duration="4.48"');
    expect(html).toContain('data-media-start="9.76"');
    expect(html).toContain("<video");
    expect(html).toContain("muted playsinline");
    expect(html).toContain("<audio");
    expect(html).toContain('src="source.mp4"');
  });

  it("registers a single main timeline and hard-kills caption groups", () => {
    const html = buildShortComposition({ sourceFileName: "source.mp4", candidate, words });
    expect(html).toContain('window.__timelines["main"]');
    expect(html).toContain('visibility: "hidden"');
  });

  it("emphasizes keywords and escapes html in titles", () => {
    const html = buildShortComposition({
      sourceFileName: "s.mp4",
      candidate: { ...candidate, title: 'A <b>bold</b> & "quoted" title' },
      words,
    });
    expect(html).toContain('class="w kw"'); // money keyword span
    expect(html).toContain("A &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot; title");
  });

  it("is deterministic", () => {
    const a = buildShortComposition({ sourceFileName: "source.mp4", candidate, words });
    const b = buildShortComposition({ sourceFileName: "source.mp4", candidate, words });
    expect(a).toBe(b);
    expect(a).not.toMatch(/Math\.random|Date\.now/);
  });
});

describe("buildPreviewDocument", () => {
  const candidate = {
    startTime: 10,
    endTime: 14,
    layout: "full-bleed" as const,
    captionStyle: "bold-pop" as const,
    keywords: ["money"],
    title: "The real reason",
  };

  it("plays the live source over the clip range with the same caption styling", () => {
    const html = buildPreviewDocument({
      videoSrc: "sp-media://video/p1",
      gsapSource: "/* gsap */",
      candidate,
      words,
    });
    expect(html).toContain('src="sp-media://video/p1"');
    // unmuted live element so the user hears the clip on play (vs the muted render)
    expect(html).not.toContain("muted");
    // padded: starts 0.24s before the first word, runs 4.48s
    expect(html).toContain("var MEDIA_START = 9.76");
    expect(html).toContain("var CLIP = 4.48");
    // shares the render's exact gsap timeline + caption groups
    expect(html).toContain('window.__timelines["main"]');
    expect(html).toContain('class="w kw"');
    expect(html).toContain("/* gsap */");
    // local-only: no network sources
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("loops the clip and reports progress to the embedder", () => {
    const html = buildPreviewDocument({
      videoSrc: "sp-media://video/p1",
      gsapSource: "",
      candidate,
      words,
    });
    expect(html).toContain("requestAnimationFrame");
    expect(html).toContain("__sp");
  });
});

describe("clip padding", () => {
  it("adds a lead-in before and lead-out after the word range", () => {
    // 10s -> 9.76 (0.24 lead-in); 4s range + 0.24 + 0.24 = 4.48s of media (rounded)
    expect(paddedClipWindow(10, 14)).toEqual({ mediaStart: 9.76, clipDuration: 4.48 });
    expect(CLIP_LEAD_IN).toBeGreaterThan(0);
    expect(CLIP_LEAD_OUT).toBeGreaterThan(0);
  });

  it("clamps the lead-in at the start of the source", () => {
    const { mediaStart, clipDuration } = paddedClipWindow(0.05, 4);
    expect(mediaStart).toBe(0);
    expect(clipDuration).toBe(4 + CLIP_LEAD_OUT);
  });

  it("keeps captions in sync: the first word appears at the lead-in offset, not 0", () => {
    const { mediaStart, clipDuration } = paddedClipWindow(10, 14);
    const groups = selectCaptionGroups(words, 10, 14, [], 4, mediaStart, clipDuration);
    // first word was at source 10s; padded clip starts at 9.76s -> caption at 0.24s
    expect(groups[0].words[0].start).toBeCloseTo(CLIP_LEAD_IN, 5);
  });

  it("keeps a fixed lead-out (Whisper word-ends run early, so it must not clamp to them)", () => {
    // a word ending right where the next is timestamped still gets the full pad,
    // because the real word audio extends past the reported end into the pause.
    const win = paddedClipWindow(10, 14);
    expect(round(win.mediaStart + win.clipDuration)).toBe(round(14 + CLIP_LEAD_OUT));
  });

  it("clamps the lead-out at the end of the source", () => {
    const win = paddedClipWindow(10, 14, 14.1);
    expect(round(win.mediaStart + win.clipDuration)).toBe(14.1);
  });
});

describe("clipWindow (pause snapping)", () => {
  const end = (w: { mediaStart: number; clipDuration: number }) =>
    round(w.mediaStart + w.clipDuration);

  it("falls back to the fixed pad when there are no silences", () => {
    expect(clipWindow(10, 14, [])).toEqual(paddedClipWindow(10, 14));
    expect(clipWindow(10, 14, undefined)).toEqual(paddedClipWindow(10, 14));
  });

  it("snaps the end into the pause just after the last word", () => {
    // a real pause opens at 14.1 (just after the word's reported end) -> end lands
    // a breath into it, well before the next word, capturing the full last word.
    const w = clipWindow(10, 14, [{ start: 14.1, end: 14.6 }]);
    expect(end(w)).toBe(14.18); // 14.1 + 0.08 breath
  });

  it("snaps the end earlier when the speaker actually stopped before Whisper's end", () => {
    const w = clipWindow(10, 14, [{ start: 13.8, end: 14.4 }]);
    expect(end(w)).toBe(13.88);
  });

  it("snaps the start out of the pause before the first word", () => {
    const w = clipWindow(10, 14, [{ start: 9.5, end: 9.9 }]);
    expect(w.mediaStart).toBe(9.82); // 9.9 - 0.08 breath
  });

  it("ignores far-away pauses and uses the fixed pad (no pause near the boundary)", () => {
    expect(clipWindow(10, 14, [{ start: 20, end: 21 }])).toEqual(paddedClipWindow(10, 14));
  });

  it("clamps a snapped window to [0, sourceDuration]", () => {
    const w = clipWindow(0.1, 14, [{ start: 14.05, end: 14.5 }], { sourceDuration: 14.1 });
    expect(w.mediaStart).toBe(0);
    expect(end(w)).toBe(14.1);
  });

  it("snaps the end to the inter-word gap, not an intra-word stop near the reported end", () => {
    // The last word's audio runs past its reported end (Whisper jitter). A short
    // *intra-word* silence sits right at the reported end (the phoneme stop inside
    // the word); the real gap is later, just before the next word. Knowing the next
    // word's start pulls the snap target to the real gap so the word isn't chopped.
    const silences = [
      { start: 241.3, end: 241.4 }, // intra-word stop, near reported end 241.5
      { start: 241.6, end: 241.8 }, // real gap before the next word
    ];
    const w = clipWindow(240, 241.5, silences, { nextWordStart: 241.9 });
    // midpoint (241.5+241.9)/2 = 241.7 lands in the real gap -> end a breath in.
    expect(end(w)).toBe(241.68); // 241.6 + 0.08, NOT 241.4x (which would cut the word)
  });

  it("snaps the end to the longest pause (the real gap), not a nearer intra-word stop", () => {
    // The trailing word ("phase") has internal phoneme stops; the real pause is the
    // long one just past the early-jittered next-word onset. Snapping to the nearest
    // would chop the word's tail (the bug); snapping to the longest captures it.
    const silences = [
      { start: 241.37, end: 241.54 }, // intra-word stop
      { start: 241.63, end: 241.73 }, // intra-word stop, nearest to the reported end
      { start: 241.83, end: 242.28 }, // the real inter-word pause (longest)
    ];
    const w = clipWindow(240, 241.48, silences, { nextWordStart: 241.8 });
    expect(end(w)).toBe(241.91); // 241.83 + 0.08, capturing the full word
  });

  it("does not snap to a pause that falls after the next word (no real gap at the boundary)", () => {
    // The speaker runs straight into the next word (no inter-word pause); the only
    // nearby silence is *after* that next word. Snapping into it would swallow the
    // next word, so the boundary falls back to the fixed pad instead.
    const w = clipWindow(480, 481.49, [{ start: 481.73, end: 482.07 }], { nextWordStart: 481.52 });
    expect(w).toEqual(paddedClipWindow(480, 481.49));
  });

  it("snaps the start using the previous word's end to find the real gap", () => {
    // symmetric to the end case: a gap sits between the previous word and the first.
    const w = clipWindow(10, 14, [{ start: 9.5, end: 9.9 }], { prevWordEnd: 9.4 });
    expect(w.mediaStart).toBe(9.82); // 9.9 - 0.08 breath
  });
});

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

describe("karaoke word timing", () => {
  // Two sentences -> at least two groups, the second starting well into the clip.
  const candidate = {
    startTime: 10,
    endTime: 14,
    layout: "full-bleed" as const,
    captionStyle: "karaoke" as const,
    keywords: [] as string[],
    title: "x",
  };

  it("lights each word at its own clip-local time, not offset by the group start", () => {
    const html = buildShortComposition({ sourceFileName: "s.mp4", candidate, words });
    // each karaoke word is tweened to opacity 1 at w.start (clip-local), the same
    // timebase the group entrance uses - never group.start + w.start (double count).
    expect(html).toContain("{ opacity: 1, duration: 0.08 }, w.start)");
    expect(html).not.toContain("group.start + w.start");
  });

  it("has a later group whose words start after 0 (so the bug would actually bite)", () => {
    const groups = selectCaptionGroups(words, 10, 14);
    expect(groups.length).toBeGreaterThan(1);
    expect(groups[1].words[0].start).toBeGreaterThan(0);
  });
});

describe("layout + static title", () => {
  const base = {
    startTime: 10,
    endTime: 14,
    captionStyle: "clean" as const,
    keywords: ["money"],
    title: 'Why <b>Layoffs</b> & "Cuts" Happen',
  };

  it("renders a static title element for top-square, escaped and in the display serif", () => {
    const html = buildShortComposition({
      sourceFileName: "s.mp4",
      candidate: { ...base, layout: "top-square" },
      words,
    });
    expect(html).toContain('class="title"');
    expect(html).toContain("Why &lt;b&gt;Layoffs&lt;/b&gt; &amp; &quot;Cuts&quot; Happen");
    // the title reads as a headline, set in the editorial display serif so it is
    // clearly separate from the sans caption below it.
    expect(html).toContain("DM Serif Display");
    // top square is flush to the top with no rounded card frame.
    expect(html).toContain("border-radius: 0");
  });

  it("renders a static title for center-square", () => {
    const html = buildShortComposition({
      sourceFileName: "s.mp4",
      candidate: { ...base, layout: "center-square" },
      words,
    });
    expect(html).toContain('class="title"');
    expect(html).toContain("DM Serif Display");
  });

  it("omits the static title for full-bleed (captions float over the video)", () => {
    const html = buildShortComposition({
      sourceFileName: "s.mp4",
      candidate: { ...base, layout: "full-bleed" },
      words,
    });
    expect(html).not.toContain('class="title"');
  });

  it("shows the same static title in the live preview", () => {
    const html = buildPreviewDocument({
      videoSrc: "sp-media://v",
      gsapSource: "",
      candidate: { ...base, layout: "top-square" },
      words,
    });
    expect(html).toContain('class="title"');
  });
});

describe("title styles", () => {
  const base = {
    startTime: 10,
    endTime: 14,
    layout: "top-square" as const,
    captionStyle: "clean" as const,
    // Pin the light theme so the vermillion accent assertions are stable; the
    // structural checks (rule/eyebrow/italic) hold in either polarity.
    theme: "light" as const,
    keywords: ["money"],
    title: "The Real Reason",
  };
  const render = (titleStyle: "plain" | "kicker" | "masthead" | "eyebrow") =>
    buildShortComposition({ sourceFileName: "s.mp4", candidate: { ...base, titleStyle }, words });

  it("kicker adds a vermillion rule above the headline", () => {
    const html = render("kicker");
    expect(html).toContain('class="rule"');
    expect(html).toContain("#c7361f"); // brand vermillion
    expect(html).not.toContain('class="eyebrow"');
  });

  it("masthead italicizes the headline and flanks it with rules", () => {
    const html = render("masthead");
    expect(html).toContain('class="ln"');
    expect(html).toContain("font-style: italic");
  });

  it("eyebrow puts the top keyword as an uppercase label above the headline", () => {
    const html = render("eyebrow");
    expect(html).toContain('class="eyebrow"');
    expect(html).toContain("money");
    expect(html).toContain("text-transform: uppercase");
  });

  it("plain renders the headline alone, no rule or eyebrow", () => {
    const html = render("plain");
    expect(html).not.toContain('class="rule"');
    expect(html).not.toContain('class="eyebrow"');
    expect(html).not.toContain('class="ln"');
    expect(html).toContain('class="title"');
  });

  it("defaults to a styled (kicker) title when none is given", () => {
    const html = buildShortComposition({ sourceFileName: "s.mp4", candidate: base, words });
    expect(html).toContain('class="rule"');
  });

  it("honors the title style in the live preview too", () => {
    const html = buildPreviewDocument({
      videoSrc: "sp-media://v",
      gsapSource: "",
      candidate: { ...base, titleStyle: "masthead" },
      words,
    });
    expect(html).toContain('class="ln"');
    expect(html).toContain("font-style: italic");
  });
});

describe("theme (color polarity)", () => {
  const square = {
    startTime: 10,
    endTime: 14,
    layout: "top-square" as const,
    captionStyle: "clean" as const,
    titleStyle: "kicker" as const,
    keywords: ["money"],
    title: "The Real Reason",
  };
  const render = (over: Record<string, unknown>) =>
    buildShortComposition({ sourceFileName: "s.mp4", candidate: { ...square, ...over }, words });

  it("defaults to the dark (ink) theme", () => {
    const html = render({});
    expect(html).toContain("background: #16161a"); // ink page
    expect(html).toContain("color: #fbf7eb"); // off-white text
    expect(html).not.toContain("background: #faf9f5");
  });

  it("light theme flips to a paper page with ink text", () => {
    const html = render({ theme: "light" });
    expect(html).toContain("background: #faf9f5"); // paper page
    expect(html).toContain("color: #16161a"); // ink text
  });

  it("dark theme flips to an ink page with warm off-white text", () => {
    const html = render({ theme: "dark" });
    expect(html).toContain("background: #16161a"); // ink page
    expect(html).toContain("color: #fbf7eb"); // off-white text
    expect(html).not.toContain("background: #faf9f5");
  });

  it("full-bleed gets a scrim element and a stroked caption in both themes", () => {
    const light = render({ layout: "full-bleed", theme: "light" });
    expect(light).toContain('class="scrim"');
    // a multi-offset stroke (light halo) around the dark caption text
    expect(light).toContain("3px 3px 0 rgba(250, 249, 245, 0.95)");
    expect(light).toContain("color: #16161a");

    const dark = render({ layout: "full-bleed", theme: "dark" });
    expect(dark).toContain('class="scrim"');
    expect(dark).toContain("3px 3px 0 rgba(0, 0, 0, 0.92)"); // dark halo
    expect(dark).toContain("color: #fbf7eb");
  });

  it("does not add a scrim to the page layouts", () => {
    expect(render({ layout: "top-square" })).not.toContain('class="scrim"');
    expect(render({ layout: "center-square" })).not.toContain('class="scrim"');
  });

  it("carries the theme through the live preview", () => {
    const html = buildPreviewDocument({
      videoSrc: "sp-media://v",
      gsapSource: "",
      candidate: { ...square, theme: "dark" },
      words,
    });
    expect(html).toContain("background: #16161a");
  });
});

describe("videoFit (square vs full)", () => {
  const base = {
    startTime: 10,
    endTime: 14,
    layout: "top-square" as const,
    captionStyle: "clean" as const,
    titleStyle: "kicker" as const,
    keywords: ["money"],
    title: "The Real Reason",
  };
  const render = (over: Record<string, unknown>, dims?: { w: number; h: number }) =>
    buildShortComposition({
      sourceFileName: "s.mp4",
      candidate: { ...base, ...over },
      words,
      sourceWidth: dims?.w,
      sourceHeight: dims?.h,
    });

  it("square crops the video to a 1080 box (object-fit cover)", () => {
    const html = render({ layout: "top-square", videoFit: "square" }, { w: 1920, h: 1080 });
    expect(html).toContain("height: 1080px");
    expect(html).toContain("object-fit: cover");
  });

  it("full sizes the video box to the source aspect and contains it (no crop)", () => {
    // 16:9 source -> full-width video is 1080 * 9/16 = 608px tall.
    const html = render({ layout: "top-square", videoFit: "full" }, { w: 1920, h: 1080 });
    expect(html).toContain("height: 608px");
    expect(html).toContain("object-fit: contain");
    // title sits right under the (shorter) video, not at the square's 1180 anchor.
    expect(html).toContain(".title { top: 708px; }");
  });

  it("centers a full video vertically for the center layout", () => {
    // 608px tall video centered in 1920 -> top = (1920-608)/2 = 656.
    const html = render({ layout: "center-square", videoFit: "full" }, { w: 1920, h: 1080 });
    expect(html).toContain("top: 656px");
    expect(html).toContain("height: 608px");
  });

  it("falls back to a square crop when the source dimensions are unknown", () => {
    const html = render({ layout: "top-square", videoFit: "full" });
    expect(html).toContain("height: 1080px");
    expect(html).toContain("object-fit: cover");
  });
});

describe("parseByteRange", () => {
  it("returns null when there is no range header", () => {
    expect(parseByteRange(null, 1000)).toBeNull();
    expect(parseByteRange("", 1000)).toBeNull();
  });

  it("parses an open-ended range", () => {
    expect(parseByteRange("bytes=0-", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseByteRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
  });

  it("parses a closed range and clamps the end to the file size", () => {
    expect(parseByteRange("bytes=0-499", 1000)).toEqual({ start: 0, end: 499 });
    expect(parseByteRange("bytes=200-99999", 1000)).toEqual({ start: 200, end: 999 });
  });

  it("parses a suffix range (last N bytes)", () => {
    expect(parseByteRange("bytes=-200", 1000)).toEqual({ start: 800, end: 999 });
  });

  it("returns 'unsatisfiable' for a start past the end of the file", () => {
    expect(parseByteRange("bytes=2000-", 1000)).toBe("unsatisfiable");
  });
});
