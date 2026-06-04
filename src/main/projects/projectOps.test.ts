import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Transcript } from "@shared/project";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapLayout, type ShortPipeLayout } from "../storage/layout";
import { type MediaDeps, probeProject, renderCandidate, transcribeProject } from "./projectOps";
import { ProjectService } from "./projectService";

let root: string;
let layout: ShortPipeLayout;
let projects: ProjectService;
let ids: number;

const transcript: Transcript = {
  words: [
    { id: "w0", text: "The", start: 0, end: 0.3 },
    { id: "w1", text: "reason", start: 0.3, end: 1.0 },
    { id: "w2", text: "matters.", start: 1.0, end: 1.8 },
  ],
};

function deps(over: Partial<MediaDeps> = {}): MediaDeps {
  return {
    probe: vi.fn().mockResolvedValue({ duration: 60, width: 1920, height: 1080, fps: 30 }),
    transcribe: vi.fn().mockResolvedValue(transcript),
    render: vi.fn().mockResolvedValue({ outputPath: "/out/clip.mp4" }),
    detectSilences: vi.fn().mockResolvedValue([]),
    ...over,
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "short-pipe-ops-"));
  layout = await bootstrapLayout(join(root, "short-pipe"));
  ids = 0;
  projects = new ProjectService({ layout, newId: () => `id${++ids}` });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("probeProject", () => {
  it("caches probe results on the project source", async () => {
    await projects.create({ sourcePath: "/v.mp4" });
    const project = await probeProject(projects, "id1", deps());
    expect(project.source).toMatchObject({ duration: 60, width: 1920, height: 1080, fps: 30 });
  });
});

describe("transcribeProject", () => {
  it("stores the transcript with detected pauses and flips status to ready", async () => {
    await projects.create({ sourcePath: "/v.mp4" });
    const silences = [{ start: 1.8, end: 2.1 }];
    const project = await transcribeProject(
      projects,
      "id1",
      deps({ detectSilences: vi.fn().mockResolvedValue(silences) }),
    );
    expect(project.transcriptStatus).toBe("ready");
    expect(await projects.getTranscript("id1")).toEqual({ ...transcript, silences });
  });

  it("still stores the transcript when pause detection fails", async () => {
    await projects.create({ sourcePath: "/v.mp4" });
    const project = await transcribeProject(
      projects,
      "id1",
      deps({ detectSilences: vi.fn().mockRejectedValue(new Error("ffmpeg boom")) }),
    );
    expect(project.transcriptStatus).toBe("ready");
    expect(await projects.getTranscript("id1")).toEqual({ ...transcript, silences: [] });
  });

  it("marks the project failed when transcription throws", async () => {
    await projects.create({ sourcePath: "/v.mp4" });
    const failing = deps({ transcribe: vi.fn().mockRejectedValue(new Error("whisper boom")) });
    await expect(transcribeProject(projects, "id1", failing)).rejects.toThrow(/whisper boom/);
    expect((await projects.get("id1")).transcriptStatus).toBe("failed");
  });
});

describe("renderCandidate", () => {
  async function setup() {
    await projects.create({ sourcePath: "/v.mp4" });
    await projects.saveTranscript("id1", transcript);
    await projects.setTranscriptStatus("id1", "ready");
    await projects.replaceCandidates("id1", [
      { title: "Clip", rank: 1, startWordId: "w0", endWordId: "w2" },
    ]);
    return (await projects.get("id1")).candidates[0].id;
  }

  it("refuses to render a candidate that is not approved", async () => {
    const candidateId = await setup();
    await expect(renderCandidate(projects, "id1", candidateId, deps())).rejects.toThrow(
      /Approve the candidate/,
    );
  });

  it("renders an approved candidate and marks it rendered", async () => {
    const candidateId = await setup();
    await projects.patchCandidate("id1", candidateId, { status: "approved" });
    const render = vi.fn().mockResolvedValue({ outputPath: "x" });
    const project = await renderCandidate(projects, "id1", candidateId, deps({ render }));
    expect(render).toHaveBeenCalledOnce();
    const candidate = project.candidates[0];
    expect(candidate.status).toBe("rendered");
    expect(candidate.renderedPath).toContain("clip-");
    // Rendered into the project's output dir with the candidate words.
    const call = render.mock.calls[0][0];
    expect(call.words).toEqual(transcript.words);
    expect(call.outputPath).toContain("output");
  });
});
