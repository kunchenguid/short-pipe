import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "@shared/events";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectService } from "../projects/projectService";
import { bootstrapLayout, type ShortPipeLayout } from "../storage/layout";
import { AgentRuntimeService, type RuntimeAgentSession } from "./agentRuntimeService";

let root: string;
let layout: ShortPipeLayout;
let projects: ProjectService;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "short-pipe-agent-"));
  layout = await bootstrapLayout(join(root, "short-pipe"));
  projects = new ProjectService({ layout, newId: () => "p1" });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A fake session that emits one assistant delta when prompted. */
function fakeSession(onPrompt?: () => void): RuntimeAgentSession {
  let listener: ((e: unknown) => void) | undefined;
  return {
    sessionId: "s1",
    sessionFile: "/sessions/s1.jsonl",
    messages: [],
    subscribe: (l) => {
      listener = l;
      return () => {
        listener = undefined;
      };
    },
    prompt: async () => {
      onPrompt?.();
      listener?.({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "Hi" },
      });
    },
    abort: async () => {},
    dispose: () => {},
    setAccessToken: () => {},
  };
}

describe("AgentRuntimeService.sendPrompt", () => {
  it("streams turn_start, assistant deltas, and turn_end with project attribution", async () => {
    await projects.create({ sourcePath: "/v.mp4", title: "Talk" });
    const service = new AgentRuntimeService({
      agentDir: layout.piAgentDir,
      getFreshAccessToken: async () => "token",
      projects,
      createSession: async () => fakeSession(),
    });

    const events: AgentEvent[] = [];
    const result = await service.sendPrompt("p1", "find shorts", (e) => events.push(e));

    expect(result.status).toBe("completed");
    expect(events.map((e) => e.type)).toEqual(["turn_start", "assistant_delta", "turn_end"]);
    expect(events.every((e) => e.projectId === "p1")).toBe(true);
    const delta = events.find((e) => e.type === "assistant_delta");
    expect(delta && "text" in delta && delta.text).toBe("Hi");
    // Persists the session file for resume.
    expect((await projects.get("p1")).agentSessionFile).toBe("/sessions/s1.jsonl");
  });

  it("rejects a concurrent turn on the same project", async () => {
    await projects.create({ sourcePath: "/v.mp4" });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const slow: RuntimeAgentSession = { ...fakeSession(), prompt: async () => gate };
    const service = new AgentRuntimeService({
      agentDir: layout.piAgentDir,
      getFreshAccessToken: async () => "token",
      projects,
      createSession: async () => slow,
    });

    const first = service.sendPrompt("p1", "a", () => {});
    await expect(service.sendPrompt("p1", "b", () => {})).rejects.toThrow(/already working/);
    release();
    await first;
    expect(service.isRunning("p1")).toBe(false);
  });

  it("reports a failed turn with the error message", async () => {
    await projects.create({ sourcePath: "/v.mp4" });
    const boom: RuntimeAgentSession = {
      ...fakeSession(),
      prompt: async () => {
        throw new Error("model exploded");
      },
    };
    const service = new AgentRuntimeService({
      agentDir: layout.piAgentDir,
      getFreshAccessToken: async () => "token",
      projects,
      createSession: async () => boom,
    });
    const events: AgentEvent[] = [];
    const result = await service.sendPrompt("p1", "go", (e) => events.push(e));
    expect(result.status).toBe("failed");
    const end = events.at(-1);
    expect(end?.type === "turn_end" && end.status).toBe("failed");
    expect(end?.type === "turn_end" && end.error).toContain("model exploded");
  });
});
