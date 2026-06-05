import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Transcript } from "@shared/project";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaDeps } from "../projects/projectOps";
import { ProjectService } from "../projects/projectService";
import { bootstrapLayout, type ShortPipeLayout } from "../storage/layout";
import { createVideoTools, videoToolNames } from "./videoTools";

let root: string;
let layout: ShortPipeLayout;
let projects: ProjectService;

const transcript: Transcript = {
  words: [
    { id: "w0", text: "The", start: 0, end: 0.3 },
    { id: "w1", text: "reason", start: 0.3, end: 1.0 },
    { id: "w2", text: "matters.", start: 1.0, end: 1.8 },
  ],
};

function media(over: Partial<MediaDeps> = {}): MediaDeps {
  return {
    probe: vi.fn().mockResolvedValue({ duration: 30, width: 1920, height: 1080, fps: 30 }),
    transcribe: vi.fn().mockResolvedValue(transcript),
    render: vi.fn().mockResolvedValue({ outputPath: "/out/clip.mp4" }),
    detectSilences: vi.fn().mockResolvedValue([]),
    ...over,
  };
}

function byName(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool;
}

async function run(tool: ToolDefinition, params: unknown): Promise<string> {
  // execute(callId, params, signal, onUpdate, ctx)
  const result = await (
    tool.execute as (...a: unknown[]) => Promise<{ content: { text: string }[] }>
  )("call-1", params, undefined, () => {}, { cwd: layout.projectsDir });
  return result.content.map((c) => c.text).join("\n");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "short-pipe-tools-"));
  layout = await bootstrapLayout(join(root, "short-pipe"));
  projects = new ProjectService({
    layout,
    newId: () => `c${Math.random().toString(36).slice(2, 6)}`,
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createVideoTools", () => {
  it("exposes the four video tools by name", () => {
    const tools = createVideoTools({ projects, projectId: "id1", media: media() });
    expect(tools.map((t) => t.name).sort()).toEqual(videoToolNames().sort());
  });

  it("tells the agent to omit user-defaulted presentation fields", () => {
    const tools = createVideoTools({ projects, projectId: "id1", media: media() });
    const schema = JSON.stringify(byName(tools, "propose_candidates").parameters);

    expect(schema).toContain("Omit layout, captionStyle, and theme");
    expect(schema).not.toContain("light = paper page + ink text (default");
  });

  it("probe caches source info and reports it", async () => {
    const p = await projects.create({ sourcePath: "/v.mp4" });
    const tools = createVideoTools({ projects, projectId: p.id, media: media() });
    const text = await run(byName(tools, "probe"), {});
    expect(text).toContain("1920x1080");
    expect((await projects.get(p.id)).source.width).toBe(1920);
  });

  it("transcribe stores words and reports the count", async () => {
    const p = await projects.create({ sourcePath: "/v.mp4" });
    const tools = createVideoTools({ projects, projectId: p.id, media: media() });
    const text = await run(byName(tools, "transcribe"), {});
    expect(text).toContain("Transcribed 3 words");
    expect((await projects.get(p.id)).transcriptStatus).toBe("ready");
  });

  it("propose_candidates fills the review queue", async () => {
    const p = await projects.create({ sourcePath: "/v.mp4" });
    await projects.saveTranscript(p.id, transcript);
    await projects.setTranscriptStatus(p.id, "ready");
    const tools = createVideoTools({ projects, projectId: p.id, media: media() });
    const text = await run(byName(tools, "propose_candidates"), {
      candidates: [
        {
          title: "Why it matters",
          rank: 1,
          startWordId: "w0",
          endWordId: "w2",
          keywords: ["reason"],
        },
      ],
    });
    expect(text).toContain("Added 1 candidate");
    expect((await projects.get(p.id)).candidates[0].title).toBe("Why it matters");
  });

  it("render_short refuses unapproved candidates", async () => {
    const p = await projects.create({ sourcePath: "/v.mp4" });
    await projects.saveTranscript(p.id, transcript);
    await projects.setTranscriptStatus(p.id, "ready");
    await projects.replaceCandidates(p.id, [
      { title: "Clip", rank: 1, startWordId: "w0", endWordId: "w2" },
    ]);
    const candidateId = (await projects.get(p.id)).candidates[0].id;
    const tools = createVideoTools({ projects, projectId: p.id, media: media() });
    await expect(run(byName(tools, "render_short"), { candidateId })).rejects.toThrow(
      /Approve the candidate/,
    );
  });
});
