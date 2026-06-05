import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectEvent } from "@shared/events";
import type { Transcript } from "@shared/project";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeJsonFile } from "../storage/json";
import { bootstrapLayout, type ShortPipeLayout } from "../storage/layout";
import { ProjectService } from "./projectService";

let root: string;
let layout: ShortPipeLayout;
let ids: number;
let service: ProjectService;

const transcript: Transcript = {
  words: [
    { id: "w0", text: "The", start: 0, end: 0.3 },
    { id: "w1", text: "real", start: 0.3, end: 0.7 },
    { id: "w2", text: "reason.", start: 0.7, end: 1.5 },
  ],
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "short-pipe-proj-"));
  layout = await bootstrapLayout(join(root, "short-pipe"));
  ids = 0;
  service = new ProjectService({
    layout,
    now: () => new Date("2026-06-03T00:00:00.000Z"),
    newId: () => `id${++ids}`,
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("create / get / list", () => {
  it("creates a project from a source path with a derived title", async () => {
    const project = await service.create({ sourcePath: "/videos/my_long_talk.mp4" });
    expect(project.id).toBe("id1");
    expect(project.title).toBe("my long talk");
    expect(project.source.path).toBe("/videos/my_long_talk.mp4");
    expect(project.transcriptStatus).toBe("none");
    expect(await service.get("id1")).toEqual(project);
  });

  it("lists summaries newest-first", async () => {
    await service.create({ sourcePath: "/a.mp4", title: "A" });
    await service.create({ sourcePath: "/b.mp4", title: "B" });
    const list = await service.list();
    expect(list.map((p) => p.title).sort()).toEqual(["A", "B"]);
    expect(list[0].candidateCount).toBe(0);
  });

  it("throws on a missing project", async () => {
    await expect(service.get("nope")).rejects.toThrow(/not found/);
  });

  it("rejects an empty source path", async () => {
    await expect(service.create({ sourcePath: "  " })).rejects.toThrow(/source video path/);
  });
});

describe("output paths", () => {
  it("uses the global default instead of a stale project outputDir", async () => {
    const svc = new ProjectService({
      layout,
      now: () => new Date("2026-06-03T00:00:00.000Z"),
      newId: () => "fixed",
      getDefaultOutputDir: () => "/global/out",
    });
    const project = await svc.create({ sourcePath: "/a.mp4" });

    expect(svc.outputDirFor({ ...project, outputDir: "/old/project/out" })).toBe("/global/out");
  });
});

describe("mutations emit project_updated", () => {
  it("emits on every persist", async () => {
    const events: ProjectEvent[] = [];
    service.subscribe((e) => events.push(e));
    await service.create({ sourcePath: "/a.mp4" });
    await service.setTranscriptStatus("id1", "running");
    expect(events.map((e) => e.type)).toEqual(["project_updated", "project_updated"]);
    const last = events[1];
    expect(last.type === "project_updated" && last.project.transcriptStatus).toBe("running");
  });

  it("bumps updatedAt via the injected clock", async () => {
    const clock = vi.fn(() => new Date("2026-06-03T00:00:00.000Z"));
    const svc = new ProjectService({ layout, now: clock, newId: () => "fixed" });
    await svc.create({ sourcePath: "/a.mp4" });
    clock.mockReturnValue(new Date("2026-06-04T00:00:00.000Z"));
    const updated = await svc.setTranscriptStatus("fixed", "ready");
    expect(updated.updatedAt).toBe("2026-06-04T00:00:00.000Z");
  });
});

describe("candidates", () => {
  async function withTranscript() {
    await service.create({ sourcePath: "/a.mp4" });
    await writeJsonFile(service.transcriptPath("id1"), transcript);
    await service.setTranscriptStatus("id1", "ready");
  }

  it("rejects proposals before a transcript exists", async () => {
    await service.create({ sourcePath: "/a.mp4" });
    await expect(
      service.replaceCandidates("id1", [
        { title: "x", rank: 1, startWordId: "w0", endWordId: "w1" },
      ]),
    ).rejects.toThrow(/before transcription/);
  });

  it("resolves word ranges and sorts by rank", async () => {
    await withTranscript();
    const project = await service.replaceCandidates("id1", [
      { title: "Second", rank: 2, startWordId: "w0", endWordId: "w1" },
      { title: "First", rank: 1, startWordId: "w1", endWordId: "w2" },
    ]);
    expect(project.candidates.map((c) => c.title)).toEqual(["First", "Second"]);
    expect(project.candidates[0]).toMatchObject({ startTime: 0.3, endTime: 1.5 });
  });

  it("recomputes cached timing when the word range is trimmed", async () => {
    await withTranscript();
    await service.replaceCandidates("id1", [
      { title: "Clip", rank: 1, startWordId: "w0", endWordId: "w2" },
    ]);
    const candidateId = (await service.get("id1")).candidates[0].id;
    const patched = await service.patchCandidate("id1", candidateId, { startWordId: "w1" });
    // w1 starts at 0.3 in the test transcript.
    expect(patched.candidates[0].startTime).toBe(0.3);
    expect(patched.candidates[0].endTime).toBe(1.5);
  });

  it("clears the manual cut override when the word range changes", async () => {
    await withTranscript();
    await service.replaceCandidates("id1", [
      { title: "Clip", rank: 1, startWordId: "w0", endWordId: "w2" },
    ]);
    const candidateId = (await service.get("id1")).candidates[0].id;

    const withCut = await service.patchCandidate("id1", candidateId, {
      cutStart: 0.05,
      cutEnd: 1.4,
    });
    expect(withCut.candidates[0]).toMatchObject({ cutStart: 0.05, cutEnd: 1.4 });

    // Re-selecting words is the "start over" gesture: the override drops.
    const retrimmed = await service.patchCandidate("id1", candidateId, { startWordId: "w1" });
    expect(retrimmed.candidates[0].cutStart).toBeUndefined();
    expect(retrimmed.candidates[0].cutEnd).toBeUndefined();
  });

  it("keeps a cut override set in the same patch as the word range", async () => {
    await withTranscript();
    await service.replaceCandidates("id1", [
      { title: "Clip", rank: 1, startWordId: "w0", endWordId: "w2" },
    ]);
    const candidateId = (await service.get("id1")).candidates[0].id;

    // The editor saves the word range and the fresh waveform cut together.
    const patched = await service.patchCandidate("id1", candidateId, {
      startWordId: "w0",
      endWordId: "w2",
      cutStart: 0.1,
      cutEnd: 1.45,
    });
    expect(patched.candidates[0]).toMatchObject({ cutStart: 0.1, cutEnd: 1.45 });
  });

  it("patches, renders, and removes candidates", async () => {
    await withTranscript();
    await service.replaceCandidates("id1", [
      { title: "Clip", rank: 1, startWordId: "w0", endWordId: "w2" },
    ]);
    const candidateId = (await service.get("id1")).candidates[0].id;

    const approved = await service.patchCandidate("id1", candidateId, { status: "approved" });
    expect(approved.candidates[0].status).toBe("approved");

    const rendered = await service.setCandidateRendered("id1", candidateId, "/out/clip.mp4");
    expect(rendered.candidates[0]).toMatchObject({
      status: "rendered",
      renderedPath: "/out/clip.mp4",
    });

    const removed = await service.removeCandidate("id1", candidateId);
    expect(removed.candidates).toHaveLength(0);
  });
});

describe("delete", () => {
  it("removes the project folder and emits a fresh list", async () => {
    await service.create({ sourcePath: "/a.mp4" });
    const events: ProjectEvent[] = [];
    service.subscribe((e) => events.push(e));
    await service.delete("id1");
    expect(await service.list()).toEqual([]);
    expect(events.at(-1)?.type).toBe("projects_listed");
  });
});
