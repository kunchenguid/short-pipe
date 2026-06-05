import { describe, expect, it } from "vitest";
import {
  anchorScrollForZoom,
  binsForWidth,
  clampDraggedHandle,
  clampZoom,
  DEFAULT_PX_PER_SEC,
  fitPxPerSec,
  INITIAL_MAX_PX_PER_SEC,
  MAX_PX_PER_SEC,
  MIN_HANDLE_GAP,
  MIN_PX_PER_SEC,
  medianWordDuration,
  timeToX,
  visibleWindow,
  WORD_LABEL_TARGET_PX,
  wordsLegiblePxPerSec,
  xToTime,
} from "./waveformView";

describe("clampZoom", () => {
  it("clamps to the supported range and falls back on non-finite input", () => {
    expect(clampZoom(5)).toBe(MIN_PX_PER_SEC);
    expect(clampZoom(99999)).toBe(MAX_PX_PER_SEC);
    expect(clampZoom(120)).toBe(120);
    expect(clampZoom(Number.NaN)).toBe(DEFAULT_PX_PER_SEC);
  });
});

describe("fitPxPerSec", () => {
  it("scales so the whole clip exactly fills the viewport", () => {
    // 600px viewport, 30s clip -> 20px/s, and 30s * 20px/s == 600px (no scroll).
    expect(fitPxPerSec(600, 30)).toBe(20);
    expect(timeToX(30, fitPxPerSec(600, 30))).toBe(600);
  });

  it("can go below the nominal minimum for long clips so they still fit", () => {
    expect(fitPxPerSec(600, 1200)).toBeCloseTo(0.5, 9);
  });

  it("falls back to the minimum when the viewport or duration is unknown", () => {
    expect(fitPxPerSec(0, 30)).toBe(MIN_PX_PER_SEC);
    expect(fitPxPerSec(600, 0)).toBe(MIN_PX_PER_SEC);
  });
});

describe("medianWordDuration", () => {
  const words = [
    { start: 0, end: 0.2 },
    { start: 1, end: 1.6 },
    { start: 2, end: 2.4 },
    { start: 10, end: 11.5 },
  ];

  it("takes the median of words overlapping the window", () => {
    // overlapping [0,3): durations 0.2, 0.6, 0.4 -> sorted 0.2,0.4,0.6 -> 0.4
    expect(medianWordDuration(words, 0, 3)).toBeCloseTo(0.4, 9);
  });

  it("falls back to all words when none overlap", () => {
    // no word overlaps [50,60): all durations 0.2,0.6,0.4,1.5 -> median 0.6
    expect(medianWordDuration(words, 50, 60)).toBeCloseTo(0.6, 9);
  });

  it("returns 0 when there are no words", () => {
    expect(medianWordDuration([], 0, 10)).toBe(0);
  });
});

describe("wordsLegiblePxPerSec", () => {
  it("targets a readable word width, clamped to [fit, caps]", () => {
    // median 0.4s -> 48/0.4 = 120px/s, within bounds.
    expect(wordsLegiblePxPerSec(0.4, 20, 800)).toBeCloseTo(WORD_LABEL_TARGET_PX / 0.4, 6);
  });

  it("never opens below fit-to-width", () => {
    // slow speech wants <50px/s but the whole clip needs 200px/s to fill -> fit wins.
    expect(wordsLegiblePxPerSec(2, 200, 800)).toBe(200);
  });

  it("caps how deep the initial zoom goes for very fast speech", () => {
    // 0.05s words would want 960px/s; capped at INITIAL_MAX_PX_PER_SEC.
    expect(wordsLegiblePxPerSec(0.05, 20, 800)).toBe(INITIAL_MAX_PX_PER_SEC);
  });
});

describe("timeToX / xToTime", () => {
  it("round-trips at a given scale", () => {
    expect(timeToX(12.5, 80)).toBe(1000);
    expect(xToTime(1000, 80)).toBe(12.5);
    expect(xToTime(timeToX(7.3, 137), 137)).toBeCloseTo(7.3, 9);
  });

  it("treats a zero scale as zero time (no divide-by-zero)", () => {
    expect(xToTime(500, 0)).toBe(0);
  });
});

describe("visibleWindow", () => {
  it("maps the viewport to a source-time window with overscan, clamped to the source", () => {
    // scrollLeft 1000px at 100px/s = 10s; viewport 500px = 5s -> [10,15] + 1s overscan.
    const w = visibleWindow(1000, 500, 100, 60, 1);
    expect(w.from).toBeCloseTo(9, 9);
    expect(w.to).toBeCloseTo(16, 9);
  });

  it("never runs past the start or end of the source", () => {
    expect(visibleWindow(0, 500, 100, 60, 1).from).toBe(0);
    const end = visibleWindow(100 * 58, 500, 100, 60, 1);
    expect(end.to).toBe(60);
  });
});

describe("binsForWidth", () => {
  it("ceils the bar count and never goes negative", () => {
    expect(binsForWidth(300, 3)).toBe(100);
    expect(binsForWidth(301, 3)).toBe(101);
    expect(binsForWidth(0, 3)).toBe(0);
    expect(binsForWidth(-50, 3)).toBe(0);
  });
});

describe("anchorScrollForZoom", () => {
  it("keeps the time under the viewport center fixed when zooming", () => {
    const viewport = 400;
    const oldPx = 100;
    const scrollLeft = 1000; // center time = (1000+200)/100 = 12s
    const newPx = 200;
    const next = anchorScrollForZoom(scrollLeft, viewport, oldPx, newPx);
    // The center time must still be 12s at the new scale.
    expect(xToTime(next + viewport / 2, newPx)).toBeCloseTo(12, 9);
  });

  it("never produces a negative scroll position", () => {
    expect(anchorScrollForZoom(0, 400, 100, 20)).toBe(0);
  });
});

describe("clampDraggedHandle", () => {
  it("uses the renderer's minimum accepted clip duration", () => {
    expect(MIN_HANDLE_GAP).toBe(0.1);
  });

  it("keeps the start left of the end and within the source", () => {
    expect(clampDraggedHandle("start", 5, 8, 60)).toBe(5);
    expect(clampDraggedHandle("start", 9, 8, 60)).toBeCloseTo(7.9, 9);
    expect(clampDraggedHandle("start", -3, 8, 60)).toBe(0);
  });

  it("keeps the end right of the start and within the source", () => {
    expect(clampDraggedHandle("end", 12, 8, 60)).toBe(12);
    expect(clampDraggedHandle("end", 7, 8, 60)).toBeCloseTo(8.1, 9);
    expect(clampDraggedHandle("end", 999, 8, 60)).toBe(60);
  });
});
