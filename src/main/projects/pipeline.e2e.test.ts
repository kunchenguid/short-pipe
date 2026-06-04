import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { probeVideo } from "../media/ffprobe";
import { bootstrapLayout } from "../storage/layout";
import { probeProject, realMediaDeps, renderCandidate, transcribeProject } from "./projectOps";
import { ProjectService } from "./projectService";

/**
 * Full on-device pipeline through the exact code paths the IPC handlers call:
 * create -> probe -> transcribe (local Whisper) -> propose -> approve -> render,
 * with real ffprobe/whisper/hyperframes against the /tmp/sp-asset test video.
 * Gated behind SP_E2E=1.
 */
const RUN = process.env.SP_E2E === "1";

describe.runIf(RUN)("full pipeline (real)", () => {
  it("produces an approved, rendered 1080x1920 short from a source video", async () => {
    const root = await mkdtemp(join(tmpdir(), "short-pipe-pipeline-"));
    try {
      const layout = await bootstrapLayout(join(root, "short-pipe"));
      const projects = new ProjectService({ layout });

      const created = await projects.create({ sourcePath: "/tmp/sp-asset/source.mp4" });

      const probed = await probeProject(projects, created.id, realMediaDeps);
      expect(probed.source.width).toBe(1280);
      expect(probed.source.height).toBe(720);
      expect(probed.source.duration).toBeGreaterThan(15);

      const transcribed = await transcribeProject(projects, created.id, realMediaDeps);
      expect(transcribed.transcriptStatus).toBe("ready");
      const transcript = await projects.getTranscript(created.id);
      expect(transcript?.words.length).toBeGreaterThan(40);

      // Simulate the agent's propose_candidates: a 5s soundbite around "real".
      const realWord = transcript?.words.find((w) => w.text.toLowerCase().startsWith("real"));
      const startIdx = transcript?.words.findIndex((w) => w.id === realWord?.id) ?? 0;
      const endWord =
        transcript?.words[Math.min(startIdx + 12, (transcript?.words.length ?? 1) - 1)];
      await projects.replaceCandidates(created.id, [
        {
          title: "The real reason",
          rank: 1,
          startWordId: realWord?.id ?? "w0",
          endWordId: endWord?.id ?? "w1",
          layout: "top-square",
          captionStyle: "bold-pop",
          keywords: ["real", "reason"],
        },
      ]);
      const candidateId = (await projects.get(created.id)).candidates[0].id;

      // The render guard requires approval first.
      await expect(
        renderCandidate(projects, created.id, candidateId, realMediaDeps),
      ).rejects.toThrow(/Approve/);

      await projects.patchCandidate(created.id, candidateId, { status: "approved" });
      const rendered = await renderCandidate(projects, created.id, candidateId, realMediaDeps);

      const candidate = rendered.candidates[0];
      expect(candidate.status).toBe("rendered");
      expect(candidate.renderedPath).toBeTruthy();
      const info = await stat(candidate.renderedPath as string);
      expect(info.size).toBeGreaterThan(1000);
      const outProbe = await probeVideo(candidate.renderedPath as string);
      expect(outProbe.width).toBe(1080);
      expect(outProbe.height).toBe(1920);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 240_000);
});
