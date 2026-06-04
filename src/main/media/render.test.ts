import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TranscriptWord } from "@shared/project";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRenderArgs, renderShort } from "./render";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const words: TranscriptWord[] = [
  { id: "w0", text: "Hello", start: 1.0, end: 1.4 },
  { id: "w1", text: "world.", start: 1.4, end: 2.0 },
];
const candidate = {
  startTime: 1,
  endTime: 2,
  layout: "full-bleed" as const,
  captionStyle: "bold-pop" as const,
  keywords: [],
  title: "Hi",
};

describe("buildRenderArgs", () => {
  it("renders the work dir to the output path in portrait", () => {
    const args = buildRenderArgs("/work", "/out/clip.mp4", { fps: 30, quality: "high" });
    expect(args).toEqual([
      "render",
      "/work",
      "-o",
      "/out/clip.mp4",
      "--resolution",
      "portrait",
      "-f",
      "30",
      "-q",
      "high",
    ]);
  });
});

describe("renderShort", () => {
  it("assembles a composition project and invokes hyperframes render", async () => {
    const root = await mkdtemp(join(tmpdir(), "short-pipe-render-"));
    dirs.push(root);
    // A stand-in source file to link into the work dir.
    const sourcePath = join(root, "source.mp4");
    await (await import("node:fs/promises")).writeFile(sourcePath, "fake-bytes");
    const workDir = join(root, "work");
    const outputPath = join(root, "out", "clip.mp4");

    const run = vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "" });
    const result = await renderShort({
      sourcePath,
      candidate,
      words,
      outputPath,
      workDir,
      fps: 30,
      run,
    });

    expect(result.outputPath).toBe(outputPath);
    // It wrote a composition referencing the linked source.
    const html = await readFile(join(workDir, "index.html"), "utf8");
    expect(html).toContain('src="source.mp4"');
    expect(html).toContain('data-resolution="portrait"');
    // And invoked the renderer with the work dir + output path.
    expect(run).toHaveBeenCalledWith(
      "hyperframes",
      expect.arrayContaining(["render", workDir, "-o", outputPath]),
      expect.any(Object),
    );
  });
});
