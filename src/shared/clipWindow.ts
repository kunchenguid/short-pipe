import type { Silence, TranscriptWord } from "./project";

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const CLIP_LEAD_IN = 0.24;
export const CLIP_LEAD_OUT = 0.24;

export function paddedClipWindow(
  startTime: number,
  endTime: number,
  sourceDuration?: number,
): { mediaStart: number; clipDuration: number } {
  const ceil = sourceDuration ?? Number.POSITIVE_INFINITY;
  const mediaStart = round(Math.max(0, startTime - CLIP_LEAD_IN));
  const mediaEnd = round(Math.min(ceil, endTime + CLIP_LEAD_OUT));
  return { mediaStart, clipDuration: round(Math.max(0.1, mediaEnd - mediaStart)) };
}

export const SNAP_JITTER = 0.25;
export const SNAP_REACH = 0.1;
export const SNAP_BREATH = 0.08;

function longestPauseIn(
  silences: Silence[],
  anchor: (s: Silence) => number,
  lo: number,
  hi: number,
): Silence | null {
  let best: Silence | null = null;
  for (const s of silences) {
    const a = anchor(s);
    if (a < lo || a > hi) continue;
    if (!best || s.end - s.start > best.end - best.start) best = s;
  }
  return best;
}

export type ClipWindowOptions = {
  sourceDuration?: number;
  prevWordEnd?: number;
  nextWordStart?: number;
};

export function clipWindow(
  startTime: number,
  endTime: number,
  silences: Silence[] | undefined,
  options: ClipWindowOptions = {},
): { mediaStart: number; clipDuration: number } {
  const { sourceDuration, prevWordEnd, nextWordStart } = options;
  if (!silences || silences.length === 0) {
    return paddedClipWindow(startTime, endTime, sourceDuration);
  }
  const ceil = sourceDuration ?? Number.POSITIVE_INFINITY;

  const startLo = (prevWordEnd ?? startTime - 0.3) - SNAP_REACH;
  const startPause = longestPauseIn(silences, (s) => s.end, startLo, startTime + SNAP_JITTER);
  const endHi = (nextWordStart ?? endTime + 0.3) + SNAP_REACH;
  const endPause = longestPauseIn(silences, (s) => s.start, endTime - SNAP_JITTER, endHi);

  const rawStart = startPause
    ? startPause.end - Math.min(SNAP_BREATH, (startPause.end - startPause.start) / 2)
    : startTime - CLIP_LEAD_IN;
  const rawEnd = endPause
    ? endPause.start + Math.min(SNAP_BREATH, (endPause.end - endPause.start) / 2)
    : endTime + CLIP_LEAD_OUT;

  const mediaStart = round(Math.max(0, rawStart));
  const mediaEnd = round(Math.min(ceil, rawEnd));
  if (mediaEnd - mediaStart < 0.1) return paddedClipWindow(startTime, endTime, sourceDuration);
  return { mediaStart, clipDuration: round(mediaEnd - mediaStart) };
}

const MIN_CLIP_DURATION = 0.1;

export type ClipBounds = {
  startTime: number;
  endTime: number;
  cutStart?: number;
  cutEnd?: number;
};

export function resolveClipWindow(
  bounds: ClipBounds,
  silences: Silence[] | undefined,
  words: TranscriptWord[],
  sourceDuration?: number,
): { mediaStart: number; clipDuration: number } {
  const { startTime, endTime, cutStart, cutEnd } = bounds;
  if (
    cutStart != null &&
    cutEnd != null &&
    Number.isFinite(cutStart) &&
    Number.isFinite(cutEnd) &&
    cutEnd - cutStart >= MIN_CLIP_DURATION
  ) {
    const ceil = sourceDuration ?? Number.POSITIVE_INFINITY;
    const mediaStart = round(Math.max(0, Math.min(cutStart, ceil)));
    const mediaEnd = round(Math.max(0, Math.min(cutEnd, ceil)));
    if (mediaEnd - mediaStart >= MIN_CLIP_DURATION) {
      return { mediaStart, clipDuration: round(mediaEnd - mediaStart) };
    }
  }
  return clipWindow(startTime, endTime, silences, {
    sourceDuration,
    ...neighborBounds(words, startTime, endTime),
  });
}

export function neighborBounds(
  words: TranscriptWord[],
  startTime: number,
  endTime: number,
): { prevWordEnd?: number; nextWordStart?: number } {
  let prevWordEnd: number | undefined;
  let nextWordStart: number | undefined;
  for (const w of words) {
    if (w.end <= startTime + 1e-6) prevWordEnd = w.end;
    if (nextWordStart === undefined && w.start >= endTime - 1e-6) nextWordStart = w.start;
  }
  return { prevWordEnd, nextWordStart };
}
