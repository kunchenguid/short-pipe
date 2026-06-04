import { describe, expect, it, vi } from "vitest";
import { buildFfprobeArgs, parseFfprobe, parseFrameRate, probeVideo } from "./ffprobe";

describe("buildFfprobeArgs", () => {
  it("requests json format and stream info for the path", () => {
    const args = buildFfprobeArgs("/v/talk.mp4");
    expect(args).toContain("-print_format");
    expect(args).toContain("json");
    expect(args).toContain("-show_streams");
    expect(args.at(-1)).toBe("/v/talk.mp4");
  });
});

describe("parseFrameRate", () => {
  it("handles NTSC rationals and whole rates", () => {
    expect(parseFrameRate("30000/1001")).toBe(29.97);
    expect(parseFrameRate("30/1")).toBe(30);
    expect(parseFrameRate("25")).toBe(25);
  });

  it("returns undefined for 0/0 and junk", () => {
    expect(parseFrameRate("0/0")).toBeUndefined();
    expect(parseFrameRate(undefined)).toBeUndefined();
  });
});

describe("parseFfprobe", () => {
  it("extracts duration, dimensions, and fps from the video stream", () => {
    const raw = JSON.stringify({
      streams: [
        { codec_type: "audio" },
        { codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30/1" },
      ],
      format: { duration: "642.5" },
    });
    expect(parseFfprobe(raw)).toEqual({
      duration: 642.5,
      width: 1920,
      height: 1080,
      fps: 30,
    });
  });

  it("falls back to r_frame_rate and stream duration", () => {
    const raw = JSON.stringify({
      streams: [
        { codec_type: "video", width: 1080, height: 1920, r_frame_rate: "24/1", duration: "12.0" },
      ],
    });
    expect(parseFfprobe(raw)).toMatchObject({ duration: 12, fps: 24, width: 1080 });
  });
});

describe("probeVideo", () => {
  it("runs ffprobe and parses the output", async () => {
    const run = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        streams: [{ codec_type: "video", width: 640, height: 480, avg_frame_rate: "30/1" }],
        format: { duration: "5" },
      }),
      stderr: "",
    });
    const result = await probeVideo("/v/x.mp4", { run });
    expect(run).toHaveBeenCalledWith(
      "ffprobe",
      expect.arrayContaining(["/v/x.mp4"]),
      expect.any(Object),
    );
    expect(result).toMatchObject({ duration: 5, width: 640, height: 480, fps: 30 });
  });
});
