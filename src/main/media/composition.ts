import { resolveClipWindow } from "@shared/clipWindow";
import type {
  Candidate,
  CaptionStyle,
  LayoutKind,
  Silence,
  Theme,
  TitleStyle,
  TranscriptWord,
  VideoFit,
} from "@shared/project";

export {
  CLIP_LEAD_IN,
  CLIP_LEAD_OUT,
  type ClipBounds,
  type ClipWindowOptions,
  clipWindow,
  neighborBounds,
  paddedClipWindow,
  resolveClipWindow,
  SNAP_BREATH,
  SNAP_JITTER,
  SNAP_REACH,
} from "@shared/clipWindow";

export const SHORT_WIDTH = 1080;
export const SHORT_HEIGHT = 1920;

export type CaptionWord = {
  text: string;
  /** Clip-local seconds. */
  start: number;
  end: number;
  keyword: boolean;
};

export type CaptionGroup = {
  start: number;
  end: number;
  words: CaptionWord[];
};

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function isKeyword(text: string, keywords: string[]): boolean {
  const bare = text.toLowerCase().replace(/[^a-z0-9']/g, "");
  return keywords.some((k) => {
    const kk = k.toLowerCase().replace(/[^a-z0-9']/g, "");
    return kk.length > 0 && kk === bare;
  });
}

/**
 * Pick the words inside [startTime, endTime], rebase their timing to clip-local
 * seconds, and group them for display. A new group starts on a >250ms pause,
 * after sentence-ending punctuation, or when `maxWords` is reached. One group is
 * visible at a time, so groups never overlap in time.
 *
 * `clipStart` is the source time that maps to clip-local 0 and `clipDuration`
 * the clip's total length. They default to the word range, but when the clip is
 * padded (lead-in/out) they are the padded values, so captions still appear in
 * sync with the speech (the first word lands at the lead-in offset, not at 0).
 */
export function selectCaptionGroups(
  words: TranscriptWord[],
  startTime: number,
  endTime: number,
  keywords: string[] = [],
  maxWords = 4,
  clipStart = startTime,
  clipDuration = round(endTime - startTime),
): CaptionGroup[] {
  const captionStart = Math.max(startTime, clipStart);
  const captionEnd = Math.min(endTime, clipStart + clipDuration);
  const inRange = words.filter((w) => w.end > captionStart && w.start < captionEnd);
  const groups: CaptionGroup[] = [];
  let current: CaptionWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    groups.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      words: current,
    });
    current = [];
  };

  for (let i = 0; i < inRange.length; i++) {
    const w = inRange[i];
    const localStart = Math.max(0, round(w.start - clipStart));
    const localEnd = round(Math.min(captionEnd, w.end) - clipStart);
    const prev = inRange[i - 1];
    const pause = prev ? w.start - prev.end : 0;
    if (current.length > 0 && (pause > 0.25 || current.length >= maxWords)) flush();
    current.push({
      text: w.text,
      start: localStart,
      end: localEnd,
      keyword: isKeyword(w.text, keywords),
    });
    if (/[.!?]$/.test(w.text.trim())) flush();
  }
  flush();

  // Stretch each group's visible end to the next group's start so captions do
  // not flicker off between groups, and clamp the last group to the clip end.
  return groups.map((g, i) => ({
    ...g,
    end: round(i + 1 < groups.length ? groups[i + 1].start : Math.min(clipDuration, g.end + 0.4)),
  }));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function captionGroupsHtml(groups: CaptionGroup[]): string {
  return groups
    .map((group, gi) => {
      const spans = group.words
        .map(
          (w, wi) =>
            `<span class="w${w.keyword ? " kw" : ""}" id="cw-${gi}-${wi}">${escapeHtml(w.text)}</span>`,
        )
        .join(" ");
      return `<div class="cap" id="cg-${gi}">${spans}</div>`;
    })
    .join("\n      ");
}

/**
 * The color polarity a short is drawn in. `light` is the brand's paper identity
 * (paper page, ink text); `dark` flips to an ink page with warm off-white text.
 * The palette is the single source of color for layout, caption, and title CSS,
 * so the theme is one orthogonal axis across every style.
 */
type ThemePalette = {
  /** Page background for the square layouts. */
  surface: string;
  /** Primary text: titles and captions. */
  ink: string;
  /** Keyword + kicker/eyebrow accent. */
  accent: string;
  /** Hairline rules (masthead). */
  rule: string;
  /** Full-bleed caption stroke - opposite polarity to `ink`, for legibility over any footage. */
  capStroke: string;
  /** Full-bleed bottom scrim gradient color. */
  scrim: string;
};

function themePalette(theme: Theme): ThemePalette {
  if (theme === "dark") {
    return {
      surface: "#16161a",
      ink: "#fbf7eb",
      accent: "#ef6a4d", // vermillion lifted for contrast on the ink page
      rule: "#3a382f",
      capStroke: "rgba(0, 0, 0, 0.92)",
      scrim: "rgba(8, 8, 7, 0.72)",
    };
  }
  return {
    surface: "#faf9f5",
    ink: "#16161a",
    accent: "#c7361f",
    rule: "#cfcdc4",
    capStroke: "rgba(250, 249, 245, 0.95)",
    scrim: "rgba(250, 249, 245, 0.86)",
  };
}

/** An 8-direction text-shadow that draws a solid ~`r`px stroke around the glyphs. */
function strokeShadow(color: string, r: number): string {
  const dirs = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
    [0, -1],
    [0, 1],
    [1, 0],
    [-1, 0],
  ];
  return dirs.map(([dx, dy]) => `${dx * r}px ${dy * r}px 0 ${color}`).join(", ");
}

/** The bottom scrim element, only over full-bleed footage (the page layouts don't need it). */
function scrimHtml(layout: LayoutKind): string {
  return layout === "full-bleed" ? `<div class="scrim"></div>` : "";
}

/** Source aspect ratio (w/h), or undefined when the dimensions aren't known. */
function aspectOf(width?: number, height?: number): number | undefined {
  return width && height && width > 0 && height > 0 ? width / height : undefined;
}

/** The video box on a page layout: where it sits, how tall, and whether it crops. */
type PageFrame = { top: number; height: number; cover: boolean };

/**
 * The video box for a square layout. `square` is a full-width 1:1 crop; `full`
 * keeps the whole source frame at its real aspect, so the box height follows the
 * source (capped to leave room for the title + captions) and the video is
 * contained, not cropped. Falls back to square when the aspect is unknown.
 */
function pageVideoFrame(layout: LayoutKind, fit: VideoFit, aspect: number | undefined): PageFrame {
  if (fit === "full" && aspect && aspect > 0) {
    const naturalHeight = Math.round(SHORT_WIDTH / aspect);
    const maxHeight = layout === "center-square" ? 1280 : 1200;
    const height = Math.min(naturalHeight, maxHeight);
    const top = layout === "center-square" ? Math.round((SHORT_HEIGHT - height) / 2) : 0;
    return { top, height, cover: false };
  }
  const top = layout === "center-square" ? 420 : 0;
  return { top, height: 1080, cover: true };
}

function layoutCss(layout: LayoutKind, p: ThemePalette, frame: PageFrame): string {
  if (layout === "full-bleed") {
    // Captions sit at one fixed anchor: every group is absolutely positioned and
    // overlaps at the same spot (bottom-anchored), so the visible line never
    // drifts as the clip moves group to group. A themed scrim under the lower
    // third lifts the captions off bright or busy footage.
    return `
      .stage { position: absolute; inset: 0; background: #000; }
      .video-wrap { position: absolute; inset: 0; }
      .video-wrap video { width: 100%; height: 100%; object-fit: cover; }
      .scrim { position: absolute; left: 0; right: 0; bottom: 0; height: 760px; pointer-events: none;
        background: linear-gradient(to top, ${p.scrim} 0%, ${p.scrim} 14%, transparent 100%); }
      .captions { position: absolute; left: 60px; right: 60px; bottom: 360px; height: 0; text-align: center; }
      .captions .cap { position: absolute; left: 0; right: 0; bottom: 0; }`;
  }

  // The static title is a headline set in the editorial display serif, so it
  // reads as clearly separate from the sans caption it sits with. The headline
  // text lives in `.ttext`; `titleStyleCss` adds the chosen accent around it.
  const titleType = `
      .title { position: absolute; left: 80px; right: 80px; text-align: center; }
      .title .ttext { font-family: "DM Serif Display", "Newsreader", Georgia, serif; color: ${p.ink};
        font-size: 60px; line-height: 1.1; letter-spacing: -0.5px;
        display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }`;

  // The video box: full-width, flush to the side edges, sized/positioned by the
  // frame. The wrap background is the page surface, so a `full` video's letterbox
  // (for off-square sources) blends into the page instead of showing black bars.
  const videoFit = frame.cover ? "cover" : "contain";
  const videoWrap = `
      .stage { position: absolute; inset: 0; background: ${p.surface}; }
      .video-wrap { position: absolute; top: ${frame.top}px; left: 0; width: 1080px; height: ${frame.height}px;
        border-radius: 0; overflow: hidden; background: ${p.surface}; }
      .video-wrap video { width: 100%; height: 100%; object-fit: ${videoFit}; }`;

  if (layout === "center-square") {
    // Square/full video centered vertically; title above it, captions below.
    return `${videoWrap}
${titleType}
      .title { bottom: ${SHORT_HEIGHT - frame.top + 40}px; }
      .captions { position: absolute; left: 80px; right: 80px; top: ${frame.top + frame.height + 100}px; height: 0; text-align: center; }
      .captions .cap { position: absolute; left: 0; right: 0; top: 0; }`;
  }

  // top-square (half and half): video pinned to the top edges, the title and
  // captions stacked in the open space below it.
  return `${videoWrap}
${titleType}
      .title { top: ${frame.height + 100}px; }
      .captions { position: absolute; left: 80px; right: 80px; top: ${frame.height + 440}px; height: 0; text-align: center; }
      .captions .cap { position: absolute; left: 0; right: 0; top: 0; }`;
}

/** Accent CSS for the chosen title style; the base type lives in `layoutCss`. */
function titleStyleCss(style: TitleStyle, p: ThemePalette): string {
  if (style === "kicker") {
    return `
      .title .rule { display: block; width: 132px; height: 6px; margin: 0 auto 26px;
        background: ${p.accent}; border-radius: 3px; }`;
  }
  if (style === "masthead") {
    // Hairlines above and below the italic headline (a masthead rule). Stacked,
    // not flanking, so they hold their look no matter how many lines the title wraps to.
    return `
      .title .ttext { font-style: italic; }
      .title .ln { display: block; width: 240px; height: 2px; margin: 0 auto; background: ${p.rule}; }
      .title .ln:first-child { margin-bottom: 22px; }
      .title .ln:last-child { margin-top: 22px; }`;
  }
  if (style === "eyebrow") {
    return `
      .title .eyebrow { display: block; font-family: "Inter", system-ui, sans-serif;
        font-weight: 700; font-size: 30px; letter-spacing: 4px; text-transform: uppercase;
        color: ${p.accent}; margin: 0 auto 18px; }`;
  }
  return ""; // plain: the headline on its own
}

/** The static title block, shown for the square layouts but not full-bleed. */
function titleHtml(
  layout: LayoutKind,
  style: TitleStyle,
  title: string,
  keywords: string[],
): string {
  if (layout === "full-bleed") return "";
  const text = `<span class="ttext">${escapeHtml(title)}</span>`;
  if (style === "kicker") {
    return `<div class="title"><span class="rule"></span>${text}</div>`;
  }
  if (style === "masthead") {
    return `<div class="title"><span class="ln"></span>${text}<span class="ln"></span></div>`;
  }
  if (style === "eyebrow") {
    const kw = keywords.find((k) => k.trim());
    const eye = kw ? `<span class="eyebrow">${escapeHtml(kw)}</span>` : "";
    return `<div class="title">${eye}${text}</div>`;
  }
  return `<div class="title">${text}</div>`;
}

function captionStyleCss(style: CaptionStyle, layout: LayoutKind, p: ThemePalette): string {
  // On the page layouts the caption is ink on a solid surface (no stroke needed).
  // Over full-bleed footage it gets a themed stroke + soft glow so it stays legible
  // on any background, in the theme's polarity (light text/dark stroke, or vice versa).
  const shadow =
    layout === "full-bleed" ? `${strokeShadow(p.capStroke, 3)}, 0 6px 20px ${p.scrim}` : "none";
  const common = `
      .cap { opacity: 0; font-family: "Outfit", "Inter", system-ui, sans-serif; color: ${p.ink};
        text-shadow: ${shadow}; line-height: 1.15; }
      .cap .w { display: inline-block; }
      .cap .kw { color: ${p.accent}; }`;
  if (style === "bold-pop") {
    return `${common}
      .cap { font-weight: 900; font-size: 96px; letter-spacing: -1px; text-transform: uppercase; }`;
  }
  if (style === "karaoke") {
    return `${common}
      .cap { font-weight: 800; font-size: 82px; }
      .cap .w { opacity: 0.35; }`;
  }
  // clean
  return `${common}
      .cap { font-weight: 700; font-size: 74px; }`;
}

/**
 * Build the timeline JS. Deterministic and seekable: each group fades in at its
 * start and is hard-killed at its end; karaoke additionally lights each word at
 * its local start. No Math.random / Date.now (capture-engine rule).
 */
function timelineJs(groups: CaptionGroup[], style: CaptionStyle): string {
  const groupsJson = JSON.stringify(
    groups.map((g) => ({
      start: g.start,
      end: g.end,
      words: g.words.map((w) => ({ start: w.start })),
    })),
  );
  const entrance =
    style === "bold-pop"
      ? `{ opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.22, ease: "back.out(1.7)", overwrite: "auto" }`
      : `{ opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.25, ease: "power3.out", overwrite: "auto" }`;
  const karaoke =
    style === "karaoke"
      ? `
        group.words.forEach(function (w, wi) {
          var wEl = document.getElementById("cw-" + gi + "-" + wi);
          if (wEl) tl.to(wEl, { opacity: 1, duration: 0.08 }, w.start);
        });`
      : "";
  return `
      window.__timelines = window.__timelines || {};
      var GROUPS = ${groupsJson};
      var tl = gsap.timeline({ paused: true });
      GROUPS.forEach(function (group, gi) {
        var el = document.getElementById("cg-" + gi);
        if (!el) return;
        tl.fromTo(el, ${entrance}, group.start);${karaoke}
        var exitAt = Math.max(group.start + 0.3, group.end - 0.12);
        tl.to(el, { opacity: 0, duration: 0.12, ease: "power2.in", overwrite: "auto" }, exitAt);
        tl.set(el, { opacity: 0, visibility: "hidden" }, group.end);
      });
      tl.seek(0);
      window.__timelines["main"] = tl;`;
}

/**
 * Live-preview driver. Drives the *same* gsap timeline the render uses, but in
 * real time off a playing <video>: every frame it seeks the timeline to the
 * video's clip-local time, loops at the clip end, and reports progress to the
 * embedding window. Pure string - given the same input it always produces the
 * same script.
 */
function previewDriverJs(mediaStart: number, clipDuration: number): string {
  return `
      (function () {
        var MEDIA_START = ${mediaStart};
        var CLIP = ${clipDuration};
        var video = document.getElementById("src-video");
        var tl = window.__timelines && window.__timelines["main"];
        var playing = false;
        function clamp(t) { return t < 0 ? 0 : (t > CLIP ? CLIP : t); }
        function paint() {
          if (video.readyState >= 1) {
            var local = video.currentTime - MEDIA_START;
            if (video.ended || local >= CLIP) { video.currentTime = MEDIA_START; local = 0; }
            else if (local < 0) { video.currentTime = MEDIA_START; local = 0; }
            if (tl) tl.seek(clamp(local));
            parent.postMessage({ __sp: "progress", t: clamp(local), dur: CLIP, playing: playing }, "*");
          }
          requestAnimationFrame(paint);
        }
        function start() {
          playing = true;
          if (video.currentTime < MEDIA_START || video.currentTime > MEDIA_START + CLIP) video.currentTime = MEDIA_START;
          var p = video.play();
          if (p && p.catch) p.catch(function () { playing = false; });
        }
        function stop() { playing = false; video.pause(); }
        window.addEventListener("message", function (e) {
          var d = e.data || {};
          if (d.__sp === "play") start();
          else if (d.__sp === "pause") stop();
          else if (d.__sp === "toggle") { playing ? stop() : start(); }
          else if (d.__sp === "seek") { video.currentTime = MEDIA_START + clamp(d.t); if (tl) tl.seek(clamp(d.t)); }
        });
        video.addEventListener("loadedmetadata", function () { video.currentTime = MEDIA_START; });
        requestAnimationFrame(paint);
        parent.postMessage({ __sp: "ready", dur: CLIP }, "*");
      })();`;
}

export type BuildPreviewInput = {
  /** Local media URL for the source video (e.g. an sp-media:// address). */
  videoSrc: string;
  /** Vendored gsap source, inlined so the preview stays fully offline. */
  gsapSource: string;
  candidate: Pick<
    Candidate,
    "startTime" | "endTime" | "layout" | "captionStyle" | "keywords" | "title"
  > & {
    titleStyle?: TitleStyle;
    theme?: Theme;
    videoFit?: VideoFit;
    cutStart?: number;
    cutEnd?: number;
  };
  words: TranscriptWord[];
  /** Detected pauses; clip boundaries snap to them when present. */
  silences?: Silence[];
  sourceDuration?: number;
  /** Source pixel dimensions, used to size a `full` (uncropped) video box. */
  sourceWidth?: number;
  sourceHeight?: number;
};

/**
 * Build a self-contained live-preview document for one short: the raw source
 * cropped/trimmed exactly like the render (same layout + caption CSS + gsap
 * timeline), but played live and looped over the clip range. Served from a
 * custom scheme so its inline driver runs with no app-CSP friction; references
 * nothing off-machine.
 */
export function buildPreviewDocument(input: BuildPreviewInput): string {
  const { candidate, videoSrc, gsapSource, words } = input;
  const { mediaStart, clipDuration } = resolveClipWindow(
    candidate,
    input.silences,
    words,
    input.sourceDuration,
  );
  const groups = selectCaptionGroups(
    words,
    candidate.startTime,
    candidate.endTime,
    candidate.keywords,
    4,
    mediaStart,
    clipDuration,
  );
  const src = escapeHtml(videoSrc);
  const titleStyle = candidate.titleStyle ?? "kicker";
  const palette = themePalette(candidate.theme ?? "dark");
  const frame = pageVideoFrame(
    candidate.layout,
    candidate.videoFit ?? "full",
    aspectOf(input.sourceWidth, input.sourceHeight),
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; media-src sp-media:; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>${escapeHtml(candidate.title)}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${SHORT_WIDTH}px; height: ${SHORT_HEIGHT}px; overflow: hidden; background: #000; }
${layoutCss(candidate.layout, palette, frame)}
${captionStyleCss(candidate.captionStyle, candidate.layout, palette)}
${titleStyleCss(titleStyle, palette)}
    </style>
  </head>
  <body>
    <div class="stage">
      <div class="video-wrap">
        <video id="src-video" src="${src}" playsinline preload="auto"></video>
      </div>
      ${scrimHtml(candidate.layout)}
      ${titleHtml(candidate.layout, titleStyle, candidate.title, candidate.keywords)}
      <div class="captions">
      ${captionGroupsHtml(groups)}
      </div>
    </div>
    <script>${gsapSource}</script>
    <script>${timelineJs(groups, candidate.captionStyle)}
    </script>
    <script>${previewDriverJs(mediaStart, clipDuration)}
    </script>
  </body>
</html>
`;
}

/**
 * Parse an HTTP Range header against a known file size. Returns the inclusive
 * byte window, `null` when there is no range, or "unsatisfiable" when the range
 * starts past the end of the file (caller should reply 416).
 */
export function parseByteRange(
  header: string | null | undefined,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;
  let start: number;
  let end: number;
  if (rawStart === "") {
    // suffix range: the last N bytes
    const n = Number(rawEnd);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (start >= size) return "unsatisfiable";
  if (end < start) return "unsatisfiable";
  return { start, end };
}

export type BuildCompositionInput = {
  /** Relative path to the source video inside the render project dir. */
  sourceFileName: string;
  candidate: Pick<
    Candidate,
    "startTime" | "endTime" | "layout" | "captionStyle" | "keywords" | "title"
  > & {
    titleStyle?: TitleStyle;
    theme?: Theme;
    videoFit?: VideoFit;
    cutStart?: number;
    cutEnd?: number;
  };
  words: TranscriptWord[];
  /** Detected pauses; clip boundaries snap to them when present. */
  silences?: Silence[];
  sourceDuration?: number;
  /** Source pixel dimensions, used to size a `full` (uncropped) video box. */
  sourceWidth?: number;
  sourceHeight?: number;
};

/**
 * Build the HyperFrames composition HTML for one short: a trimmed source
 * segment (via data-media-start) at 1080x1920 with synced captions. Pure - given
 * the same input it always produces the same HTML.
 */
export function buildShortComposition(input: BuildCompositionInput): string {
  const { candidate, sourceFileName, words } = input;
  const { mediaStart, clipDuration } = resolveClipWindow(
    candidate,
    input.silences,
    words,
    input.sourceDuration,
  );
  const groups = selectCaptionGroups(
    words,
    candidate.startTime,
    candidate.endTime,
    candidate.keywords,
    4,
    mediaStart,
    clipDuration,
  );
  const src = escapeHtml(sourceFileName);
  const titleStyle = candidate.titleStyle ?? "kicker";
  const palette = themePalette(candidate.theme ?? "dark");
  const frame = pageVideoFrame(
    candidate.layout,
    candidate.videoFit ?? "full",
    aspectOf(input.sourceWidth, input.sourceHeight),
  );

  return `<!doctype html>
<html lang="en" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>${escapeHtml(candidate.title)}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${SHORT_WIDTH}px; height: ${SHORT_HEIGHT}px; overflow: hidden; background: #000; }
${layoutCss(candidate.layout, palette, frame)}
${captionStyleCss(candidate.captionStyle, candidate.layout, palette)}
${titleStyleCss(titleStyle, palette)}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${clipDuration}"
         data-width="${SHORT_WIDTH}" data-height="${SHORT_HEIGHT}">
      <div class="stage">
        <div class="video-wrap">
          <video id="src-video" data-start="0" data-duration="${clipDuration}" data-media-start="${mediaStart}"
                 data-track-index="0" src="${src}" muted playsinline></video>
        </div>
        ${scrimHtml(candidate.layout)}
        ${titleHtml(candidate.layout, titleStyle, candidate.title, candidate.keywords)}
        <div class="captions">
      ${captionGroupsHtml(groups)}
        </div>
      </div>
      <audio id="src-audio" data-start="0" data-duration="${clipDuration}" data-media-start="${mediaStart}"
             data-track-index="2" src="${src}" data-volume="1"></audio>
    </div>
    <script>${timelineJs(groups, candidate.captionStyle)}
    </script>
  </body>
</html>
`;
}
