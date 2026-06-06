import { describe, expect, it } from "vitest";
import { parseRenderProgress } from "./renderProgress";

describe("parseRenderProgress", () => {
  it("pulls the percentage out of a hyperframes progress line", () => {
    expect(parseRenderProgress("  ████░░░░  30%  Capturing frame 30/300")).toBe(30);
  });

  it("reads single-digit percentages", () => {
    expect(parseRenderProgress("  █░░░  5%  Compiling composition")).toBe(5);
  });

  it("reads 100% completion", () => {
    expect(parseRenderProgress("  ████████  100%  Render complete")).toBe(100);
  });

  it("returns the last percentage when a chunk carries several redraws", () => {
    // Hyperframes overwrites the same line with \r; a single stdout chunk can
    // carry more than one redraw, and the latest one is the truthful state.
    const chunk = "\r\x1b[2K  30%  Capturing\r\x1b[2K  34%  Capturing";
    expect(parseRenderProgress(chunk)).toBe(34);
  });

  it("ignores frame fractions that are not percentages", () => {
    // "30/300" must not be misread as progress - only a number before % counts.
    expect(parseRenderProgress("Capturing frame 30/300 (6 workers)")).toBeNull();
  });

  it("returns null for chunks without a percentage", () => {
    expect(parseRenderProgress("[INFO] Compiled composition metadata")).toBeNull();
    expect(parseRenderProgress("")).toBeNull();
  });

  it("clamps out-of-range values to 0-100", () => {
    expect(parseRenderProgress("999%")).toBe(100);
  });
});
