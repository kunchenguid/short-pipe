// @vitest-environment jsdom

import type { ShortPipeApi } from "@shared/ipc";
import type { Project } from "@shared/project";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const projectWithoutDuration: Project = {
  id: "p1",
  title: "Long Talk",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  source: { path: "/video.mp4" },
  transcriptStatus: "ready",
  candidates: [],
};

function stubBridge(overrides: Partial<ShortPipeApi> = {}) {
  const bridge: ShortPipeApi = {
    app: {
      info: vi.fn(),
      getUpdateStatus: vi.fn(),
      openReleasePage: vi.fn(),
    },
    settings: {
      get: vi.fn(),
      update: vi.fn(),
      chooseOutputDir: vi.fn(),
    },
    auth: {
      status: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    },
    projects: {
      list: vi.fn(),
      get: vi.fn(async () => projectWithoutDuration),
      create: vi.fn(),
      delete: vi.fn(),
      pickSource: vi.fn(),
      revealOutput: vi.fn(),
      probe: vi.fn(() => new Promise<Project>(() => undefined)),
    },
    transcript: { get: vi.fn(async () => null), run: vi.fn() },
    waveform: { peaks: vi.fn(async () => []) },
    candidates: {
      patch: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      remove: vi.fn(),
      render: vi.fn(),
    },
    agent: { history: vi.fn(), send: vi.fn(), abort: vi.fn(), isRunning: vi.fn(async () => false) },
    events: { on: vi.fn(() => () => undefined) },
    ...overrides,
  };
  window.shortpipe = bridge;
  return bridge;
}

beforeEach(() => {
  vi.resetModules();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Workspace empty-state generation", () => {
  it("waits for source duration before enabling the initial agent run", async () => {
    const bridge = stubBridge();
    const { Workspace } = await import("./Workspace");

    await act(async () => {
      root.render(<Workspace projectId="p1" onBack={() => undefined} />);
    });

    expect(container.textContent).toContain("Waiting for video details");
    const runButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Find shorts"),
    );

    expect(runButton).toBeInstanceOf(HTMLButtonElement);
    expect((runButton as HTMLButtonElement).disabled).toBe(true);
    act(() => {
      runButton?.click();
    });
    expect(bridge.agent.send).not.toHaveBeenCalled();
  });
});
