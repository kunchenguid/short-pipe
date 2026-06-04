import { readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { probeVideo } from "./ffprobe";
import { renderShort } from "./render";
import { normalizeTranscript } from "./transcribe";

/**
 * Real, on-device render of a captioned short from the test asset built under
 * /tmp/sp-asset (source.mp4 + tdir/transcript.json). Gated behind SP_E2E=1
 * because it launches headless Chrome + ffmpeg and takes ~30-60s.
 */
const RUN = process.env.SP_E2E === "1";

describe.runIf(RUN)("renderShort (real)", () => {
  it("renders a 1080x1920 captioned clip from the source segment", async () => {
    const assetDir = "/tmp/sp-asset";
    const transcript = normalizeTranscript(
      JSON.parse(await readFile(join(assetDir, "tdir", "transcript.json"), "utf8")),
    );
    expect(transcript.words.length).toBeGreaterThan(10);

    // "The real reason is that leadership made a bet on growth..." sits mid-clip.
    const start = transcript.words.find((w) => w.text.toLowerCase().startsWith("real"));
    expect(start).toBeDefined();
    const startTime = start ? Math.max(0, start.start - 0.4) : 5;
    const endTime = startTime + 5;

    const outputPath = join(tmpdir(), `short-pipe-e2e-${Date.now()}.mp4`);
    const workDir = join(tmpdir(), `short-pipe-e2e-work-${Date.now()}`);
    try {
      await renderShort({
        sourcePath: join(assetDir, "source.mp4"),
        candidate: {
          startTime,
          endTime,
          layout: "top-square",
          captionStyle: "bold-pop",
          keywords: ["reason", "growth"],
          title: "The real reason",
        },
        words: transcript.words,
        outputPath,
        workDir,
        fps: 30,
        quality: "draft",
        onProgress: (c) => process.stdout.write(c),
      });

      const info = await stat(outputPath);
      expect(info.size).toBeGreaterThan(1000);
      const probe = await probeVideo(outputPath);
      expect(probe.width).toBe(1080);
      expect(probe.height).toBe(1920);
      expect(probe.duration).toBeGreaterThan(3);
    } finally {
      await rm(outputPath, { force: true });
      await rm(workDir, { recursive: true, force: true });
    }
  }, 180_000);
});
