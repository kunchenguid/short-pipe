import type { TranscriptWord } from "@shared/project";

/** Which end of the clip a nudge step acts on. */
export type Handle = "start" | "end";

export type Range = { startId: string; endId: string };

export function indexOfId(words: TranscriptWord[], id: string): number {
  return words.findIndex((w) => w.id === id);
}

/** Ensure both ids exist and start <= end, falling back to the full span. */
export function clampRange(words: TranscriptWord[], range: Range): Range {
  if (words.length === 0) return range;
  let s = indexOfId(words, range.startId);
  let e = indexOfId(words, range.endId);
  if (s < 0) s = 0;
  if (e < 0) e = words.length - 1;
  if (s > e) [s, e] = [e, s];
  return { startId: words[s].id, endId: words[e].id };
}

/**
 * Ordered range between an anchor and the hovered word - the core of
 * highlight-to-select. Dragging in either direction selects the same passage,
 * exactly like quoting text: whichever word is earlier becomes the start.
 */
export function rangeBetween(words: TranscriptWord[], anchorId: string, hoverId: string): Range {
  let a = indexOfId(words, anchorId);
  let b = indexOfId(words, hoverId);
  if (a < 0) a = 0;
  if (b < 0) b = 0;
  const s = Math.min(a, b);
  const e = Math.max(a, b);
  return { startId: words[s].id, endId: words[e].id };
}

/** Drag the start handle to the hovered word, never crossing past the end. */
export function dragStart(words: TranscriptWord[], range: Range, hoverId: string): Range {
  let i = indexOfId(words, hoverId);
  let e = indexOfId(words, range.endId);
  if (i < 0) i = 0;
  if (e < 0) e = words.length - 1;
  const s = Math.min(i, e);
  return { startId: words[s].id, endId: words[e].id };
}

/** Drag the end handle to the hovered word, never crossing before the start. */
export function dragEnd(words: TranscriptWord[], range: Range, hoverId: string): Range {
  let i = indexOfId(words, hoverId);
  let s = indexOfId(words, range.startId);
  if (i < 0) i = words.length - 1;
  if (s < 0) s = 0;
  const e = Math.max(i, s);
  return { startId: words[s].id, endId: words[e].id };
}

/**
 * Step a boundary by `delta` words (the -/+ nudge controls). For the start, a
 * negative delta extends the clip earlier; for the end, a positive delta extends
 * it later. Boundaries clamp to the transcript edges and never cross each other.
 */
export function nudge(words: TranscriptWord[], range: Range, handle: Handle, delta: number): Range {
  let s = indexOfId(words, range.startId);
  let e = indexOfId(words, range.endId);
  if (s < 0) s = 0;
  if (e < 0) e = words.length - 1;
  if (handle === "start") {
    s = Math.min(Math.max(0, s + delta), e);
  } else {
    e = Math.max(Math.min(words.length - 1, e + delta), s);
  }
  return { startId: words[s].id, endId: words[e].id };
}
