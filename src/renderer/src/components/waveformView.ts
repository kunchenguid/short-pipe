/**
 * Pure geometry for the waveform trimmer: mapping between source time and the
 * horizontal pixel space of a zoomable, scrollable timeline. Kept apart from the
 * React component so the math is unit-tested without a DOM.
 */

/** Sensible default scale: 100px per second reads comfortably for speech. */
export const DEFAULT_PX_PER_SEC = 100;
/** Zoomed all the way out: ~20px/s still shows minutes of context. */
export const MIN_PX_PER_SEC = 20;
/** Zoomed all the way in: 800px/s is sub-frame fine for nudging a word edge. */
export const MAX_PX_PER_SEC = 800;
/** Nominal width of one drawn peak bar; sets how many bins a window needs. */
export const BAR_PX = 3;
/** Extra seconds fetched/drawn beyond the viewport to hide scroll-edge flicker. */
export const OVERSCAN_SEC = 1;
/** Smallest clip the handles may pinch to, so start never crosses end. */
export const MIN_HANDLE_GAP = 0.1;
/** Target on-screen width (px) for a typical word, so its label is readable. */
export const WORD_LABEL_TARGET_PX = 48;
/** Cap on the initial zoom, so very fast speech doesn't open absurdly deep. */
export const INITIAL_MAX_PX_PER_SEC = 240;

export function clampZoom(pxPerSec: number): number {
  if (!Number.isFinite(pxPerSec)) return DEFAULT_PX_PER_SEC;
  return Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, pxPerSec));
}

/**
 * The scale at which the whole source exactly fills the viewport - the most
 * zoomed-out the timeline ever goes, so the entire clip is visible at min zoom
 * without horizontal scroll.
 */
export function fitPxPerSec(viewportPx: number, duration: number): number {
  if (viewportPx <= 0 || duration <= 0) return MIN_PX_PER_SEC;
  return viewportPx / duration;
}

/** The median duration of the words overlapping [from, to] (falls back to all words). */
export function medianWordDuration(
  words: { start: number; end: number }[],
  from: number,
  to: number,
): number {
  const inRange = words.filter((w) => w.end > from && w.start < to);
  const src = (inRange.length ? inRange : words)
    .map((w) => w.end - w.start)
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  if (src.length === 0) return 0;
  return src[Math.floor(src.length / 2)];
}

/**
 * Initial zoom: deep enough that a typical word's label is legible (~{@link
 * WORD_LABEL_TARGET_PX} px wide), bounded below by fit-to-width and above by a
 * sane cap. This is where the timeline first opens, before the user zooms.
 */
export function wordsLegiblePxPerSec(medianDuration: number, fitPx: number, maxPx: number): number {
  const target = medianDuration > 0 ? WORD_LABEL_TARGET_PX / medianDuration : DEFAULT_PX_PER_SEC;
  return Math.max(fitPx, Math.min(target, maxPx, INITIAL_MAX_PX_PER_SEC));
}

export function timeToX(t: number, pxPerSec: number): number {
  return t * pxPerSec;
}

export function xToTime(x: number, pxPerSec: number): number {
  return pxPerSec > 0 ? x / pxPerSec : 0;
}

/** The source-time window visible in the viewport, padded by overscan and clamped to the source. */
export function visibleWindow(
  scrollLeft: number,
  viewportPx: number,
  pxPerSec: number,
  duration: number,
  overscan = OVERSCAN_SEC,
): { from: number; to: number } {
  const from = Math.max(0, xToTime(scrollLeft, pxPerSec) - overscan);
  const to = Math.min(duration, xToTime(scrollLeft + viewportPx, pxPerSec) + overscan);
  return { from, to: Math.max(from, to) };
}

/** How many peak bars to request for a window of the given pixel width. */
export function binsForWidth(widthPx: number, barPx = BAR_PX): number {
  return Math.max(0, Math.ceil(widthPx / barPx));
}

/** New scrollLeft that keeps the time at the viewport center fixed across a zoom change. */
export function anchorScrollForZoom(
  scrollLeft: number,
  viewportPx: number,
  oldPxPerSec: number,
  newPxPerSec: number,
): number {
  const centerTime = xToTime(scrollLeft + viewportPx / 2, oldPxPerSec);
  return Math.max(0, timeToX(centerTime, newPxPerSec) - viewportPx / 2);
}

/**
 * Clamp a dragged handle to `[0, duration]` and keep it on its own side of the
 * other handle (a `MIN_HANDLE_GAP` apart), so the selection can never invert.
 */
export function clampDraggedHandle(
  which: "start" | "end",
  t: number,
  other: number,
  duration: number,
  minGap = MIN_HANDLE_GAP,
): number {
  const clamped = Math.min(duration, Math.max(0, t));
  if (which === "start") return Math.max(0, Math.min(clamped, other - minGap));
  return Math.min(duration, Math.max(clamped, other + minGap));
}
