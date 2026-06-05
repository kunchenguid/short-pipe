import { describe, expect, it } from "vitest";
import { buildWaveformArgs, peaksFromPcm, WAVEFORM_SAMPLE_RATE } from "./waveform";

/** Build an s16le mono PCM buffer from sample values. */
function pcm(...samples: number[]): Buffer {
  const buf = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => {
    buf.writeInt16LE(s, i * 2);
  });
  return buf;
}

describe("peaksFromPcm", () => {
  it("returns the loudest absolute sample per bin, normalized to 0..1", () => {
    // Four samples, two bins -> [max(|100|,|0|), max(|0|,|-32768|)] / 32768.
    const peaks = peaksFromPcm(pcm(100, 0, 0, -32768), 2);
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toBeCloseTo(100 / 32768, 6);
    expect(peaks[1]).toBeCloseTo(1, 6);
  });

  it("uses the peak (not the last sample) within a bin", () => {
    const peaks = peaksFromPcm(pcm(8000, 16000, 4000), 1);
    expect(peaks[0]).toBeCloseTo(16000 / 32768, 6);
  });

  it("zero-fills bins when there are no samples", () => {
    expect(peaksFromPcm(Buffer.alloc(0), 3)).toEqual([0, 0, 0]);
  });

  it("returns one bin per slot even when bins exceed the sample count", () => {
    const peaks = peaksFromPcm(pcm(20000, -10000), 5);
    expect(peaks).toHaveLength(5);
    // Every bin maps to a real sample (no NaN/undefined), all within 0..1.
    for (const p of peaks) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("returns an empty array for a non-positive bin count", () => {
    expect(peaksFromPcm(pcm(1, 2, 3), 0)).toEqual([]);
    expect(peaksFromPcm(pcm(1, 2, 3), -4)).toEqual([]);
  });
});

describe("buildWaveformArgs", () => {
  it("input-seeks to `from` and bounds the decode to the window duration", () => {
    const args = buildWaveformArgs("/clip.mp4", 12.5, 19);
    expect(args).toContain("/clip.mp4");
    // -ss precedes -i (fast input seek), -t is the window length.
    expect(args[args.indexOf("-ss") + 1]).toBe("12.5");
    expect(args[args.indexOf("-i") + 1]).toBe("/clip.mp4");
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
    expect(args[args.indexOf("-t") + 1]).toBe("6.5");
    expect(args[args.indexOf("-ar") + 1]).toBe(String(WAVEFORM_SAMPLE_RATE));
    expect(args[args.indexOf("-ac") + 1]).toBe("1");
    expect(args[args.length - 1]).toBe("-");
  });

  it("never produces a negative seek or duration", () => {
    const args = buildWaveformArgs("/clip.mp4", -3, -1);
    expect(args[args.indexOf("-ss") + 1]).toBe("0");
    expect(args[args.indexOf("-t") + 1]).toBe("0");
  });
});
