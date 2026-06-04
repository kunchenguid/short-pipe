import type { TranscriptWord } from "@shared/project";
import { describe, expect, it } from "vitest";
import { clampRange, dragEnd, dragStart, nudge, rangeBetween } from "./transcriptSelection";

const words: TranscriptWord[] = Array.from({ length: 8 }, (_, i) => ({
  id: `w${i}`,
  text: `word${i}`,
  start: i,
  end: i + 1,
}));

describe("rangeBetween", () => {
  it("orders the anchor and hover, regardless of drag direction", () => {
    expect(rangeBetween(words, "w2", "w5")).toEqual({ startId: "w2", endId: "w5" });
    expect(rangeBetween(words, "w5", "w2")).toEqual({ startId: "w2", endId: "w5" });
  });

  it("collapses to a single word when anchor and hover match", () => {
    expect(rangeBetween(words, "w3", "w3")).toEqual({ startId: "w3", endId: "w3" });
  });
});

describe("dragStart", () => {
  it("moves the start to the hovered word", () => {
    expect(dragStart(words, { startId: "w3", endId: "w5" }, "w1")).toEqual({
      startId: "w1",
      endId: "w5",
    });
  });

  it("never lets the start cross past the end", () => {
    expect(dragStart(words, { startId: "w3", endId: "w5" }, "w7")).toEqual({
      startId: "w5",
      endId: "w5",
    });
  });
});

describe("dragEnd", () => {
  it("moves the end to the hovered word", () => {
    expect(dragEnd(words, { startId: "w2", endId: "w4" }, "w6")).toEqual({
      startId: "w2",
      endId: "w6",
    });
  });

  it("never lets the end cross before the start", () => {
    expect(dragEnd(words, { startId: "w4", endId: "w6" }, "w1")).toEqual({
      startId: "w4",
      endId: "w4",
    });
  });
});

describe("nudge", () => {
  it("extends the start one word earlier", () => {
    expect(nudge(words, { startId: "w3", endId: "w5" }, "start", -1)).toEqual({
      startId: "w2",
      endId: "w5",
    });
  });

  it("extends the end one word later", () => {
    expect(nudge(words, { startId: "w3", endId: "w5" }, "end", 1)).toEqual({
      startId: "w3",
      endId: "w6",
    });
  });

  it("clamps the start at 0 and never past the end", () => {
    expect(nudge(words, { startId: "w0", endId: "w5" }, "start", -1).startId).toBe("w0");
    expect(nudge(words, { startId: "w5", endId: "w5" }, "start", 1).startId).toBe("w5");
  });

  it("clamps the end at the last word and never before the start", () => {
    expect(nudge(words, { startId: "w3", endId: "w7" }, "end", 1).endId).toBe("w7");
    expect(nudge(words, { startId: "w3", endId: "w3" }, "end", -1).endId).toBe("w3");
  });
});

describe("clampRange", () => {
  it("orders an inverted range and fills missing ids", () => {
    expect(clampRange(words, { startId: "w5", endId: "w2" })).toEqual({
      startId: "w2",
      endId: "w5",
    });
    expect(clampRange(words, { startId: "nope", endId: "w4" })).toEqual({
      startId: "w0",
      endId: "w4",
    });
  });
});
