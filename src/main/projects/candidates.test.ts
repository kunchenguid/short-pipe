import type { TranscriptWord } from "@shared/project";
import { describe, expect, it } from "vitest";
import { candidateFromProposal, sortByRank, wordTimeRange } from "./candidates";

const words: TranscriptWord[] = [
  { id: "w0", text: "The", start: 0, end: 0.3 },
  { id: "w1", text: "real", start: 0.3, end: 0.7 },
  { id: "w2", text: "reason", start: 0.7, end: 1.2 },
  { id: "w3", text: "is", start: 1.2, end: 1.4 },
  { id: "w4", text: "money.", start: 1.4, end: 2.0 },
];

describe("wordTimeRange", () => {
  it("returns start of the first word to end of the last", () => {
    expect(wordTimeRange(words, "w1", "w4")).toEqual({ startTime: 0.3, endTime: 2.0 });
  });

  it("throws on an unknown word id", () => {
    expect(() => wordTimeRange(words, "w1", "w99")).toThrow(/Unknown end word id/);
    expect(() => wordTimeRange(words, "wX", "w4")).toThrow(/Unknown start word id/);
  });

  it("throws on an inverted range", () => {
    expect(() => wordTimeRange(words, "w4", "w0")).toThrow(/Inverted word range/);
  });
});

describe("candidateFromProposal", () => {
  it("caches derived timing and fills defaults", () => {
    const candidate = candidateFromProposal(
      { title: "  The real reason  ", rank: 1, startWordId: "w0", endWordId: "w4" },
      words,
      "c1",
    );
    expect(candidate).toMatchObject({
      id: "c1",
      title: "The real reason",
      rank: 1,
      startTime: 0,
      endTime: 2.0,
      layout: "top-square",
      captionStyle: "clean",
      titleStyle: "kicker",
      theme: "light",
      videoFit: "square",
      keywords: [],
      status: "proposed",
    });
  });

  it("keeps valid layout/caption and trims keywords", () => {
    const candidate = candidateFromProposal(
      {
        title: "Money",
        rank: 2,
        startWordId: "w2",
        endWordId: "w4",
        layout: "full-bleed",
        captionStyle: "karaoke",
        titleStyle: "masthead",
        theme: "dark",
        videoFit: "full",
        keywords: [" money ", "", "reason"],
      },
      words,
      "c2",
    );
    expect(candidate.layout).toBe("full-bleed");
    expect(candidate.captionStyle).toBe("karaoke");
    expect(candidate.titleStyle).toBe("masthead");
    expect(candidate.theme).toBe("dark");
    expect(candidate.videoFit).toBe("full");
    expect(candidate.keywords).toEqual(["money", "reason"]);
  });

  it("falls back to defaults for invalid layout/caption", () => {
    const candidate = candidateFromProposal(
      {
        title: "x",
        rank: 1,
        startWordId: "w0",
        endWordId: "w1",
        layout: "weird" as never,
        captionStyle: "fancy" as never,
        titleStyle: "shiny" as never,
        theme: "neon" as never,
        videoFit: "circle" as never,
      },
      words,
      "c3",
    );
    expect(candidate.layout).toBe("top-square");
    expect(candidate.captionStyle).toBe("clean");
    expect(candidate.titleStyle).toBe("kicker");
    expect(candidate.theme).toBe("light");
    expect(candidate.videoFit).toBe("square");
  });

  it("maps the legacy 'card' layout to top-square", () => {
    const candidate = candidateFromProposal(
      { title: "x", rank: 1, startWordId: "w0", endWordId: "w1", layout: "card" as never },
      words,
      "c4",
    );
    expect(candidate.layout).toBe("top-square");
  });
});

describe("sortByRank", () => {
  it("orders best-first and is stable on ties", () => {
    const base = { startWordId: "w0", endWordId: "w1", startTime: 0, endTime: 1 } as const;
    const make = (id: string, rank: number) =>
      candidateFromProposal({ title: id, rank, ...base }, words, id);
    const sorted = sortByRank([make("a", 2), make("b", 1), make("c", 2)]);
    expect(sorted.map((c) => c.id)).toEqual(["b", "a", "c"]);
  });
});
