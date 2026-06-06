// @vitest-environment jsdom

import { defaultShortPipeConfig } from "@shared/config";
import type { ShortPipeApi } from "@shared/ipc";
import type { Candidate, Project } from "@shared/project";
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

const sampleCandidate: Candidate = {
  id: "c1",
  title: "The real reason layoffs happen",
  rank: 1,
  startWordId: "w0",
  endWordId: "w9",
  startTime: 0,
  endTime: 30,
  layout: "full-bleed",
  captionStyle: "clean",
  titleStyle: "plain",
  theme: "light",
  videoFit: "full",
  keywords: ["layoffs"],
  status: "proposed",
};

const projectWithCandidate: Project = {
  ...projectWithoutDuration,
  source: { path: "/video.mp4", duration: 600 },
  candidates: [sampleCandidate],
};

function stubBridge(overrides: Partial<ShortPipeApi> = {}) {
  const bridge: ShortPipeApi = {
    app: {
      info: vi.fn(),
      getUpdateStatus: vi.fn(),
      openReleasePage: vi.fn(),
      openExternal: vi.fn(),
    },
    settings: {
      get: vi.fn(async () => defaultShortPipeConfig()),
      update: vi.fn(),
      chooseOutputDir: vi.fn(),
    },
    auth: {
      status: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    },
    deps: { check: vi.fn(async () => []) },
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

  it("keeps a user-selected target duration when settings load later", async () => {
    let resolveSettings: (config: ReturnType<typeof defaultShortPipeConfig>) => void = () =>
      undefined;
    const settingsPromise = new Promise<ReturnType<typeof defaultShortPipeConfig>>((resolve) => {
      resolveSettings = resolve;
    });
    const bridge = stubBridge({
      settings: {
        get: vi.fn(() => settingsPromise),
        update: vi.fn(),
        chooseOutputDir: vi.fn(),
      },
      projects: {
        list: vi.fn(),
        get: vi.fn(async () => ({
          ...projectWithoutDuration,
          source: { path: "/video.mp4", duration: 600 },
        })),
        create: vi.fn(),
        delete: vi.fn(),
        pickSource: vi.fn(),
        revealOutput: vi.fn(),
        probe: vi.fn(async () => ({
          ...projectWithoutDuration,
          source: { path: "/video.mp4", duration: 600 },
        })),
      },
    });
    const { Workspace } = await import("./Workspace");

    await act(async () => {
      root.render(<Workspace projectId="p1" onBack={() => undefined} />);
    });

    const select = container.querySelector<HTMLSelectElement>("select.duration-select");
    expect(select).toBeInstanceOf(HTMLSelectElement);
    act(() => {
      if (select) {
        select.value = "45";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    await act(async () => {
      resolveSettings({ ...defaultShortPipeConfig(), defaultTargetDurationSec: 30 });
      await settingsPromise;
    });

    const runButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Find shorts"),
    );
    expect(runButton).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      runButton?.click();
    });

    expect(bridge.agent.send).toHaveBeenCalledTimes(1);
    const [, prompt] = (bridge.agent.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(prompt).toContain("45 seconds");
  });
});

describe("Workspace add-one-more-short", () => {
  it("does not expose add-one-more controls before the first short exists", async () => {
    stubBridge();
    const { Workspace } = await import("./Workspace");

    await act(async () => {
      root.render(<Workspace projectId="p1" onBack={() => undefined} />);
    });

    expect(container.querySelector('button[aria-label="Add one more short"]')).not.toBeInstanceOf(
      HTMLButtonElement,
    );
    const addButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Add one more short"),
    );
    expect(addButton).toBeUndefined();
  });

  it("sends the user's prompt to the agent to find one additional short", async () => {
    const bridge = stubBridge({
      projects: {
        list: vi.fn(),
        get: vi.fn(async () => projectWithCandidate),
        create: vi.fn(),
        delete: vi.fn(),
        pickSource: vi.fn(),
        revealOutput: vi.fn(),
        probe: vi.fn(async () => projectWithCandidate),
      },
    });
    const { Workspace } = await import("./Workspace");

    await act(async () => {
      root.render(<Workspace projectId="p1" onBack={() => undefined} />);
    });

    // Reveal the prompt input from the left filmstrip.
    const addButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Add one more short"),
    );
    expect(addButton).toBeInstanceOf(HTMLButtonElement);
    act(() => {
      addButton?.click();
    });

    const input = container.querySelector("textarea.add-input") as HTMLTextAreaElement | null;
    expect(input).toBeInstanceOf(HTMLTextAreaElement);
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    act(() => {
      setValue?.call(input, "a punchy hook about burnout");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const submit = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Find it"),
    );
    expect(submit).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      submit?.click();
    });

    expect(bridge.agent.send).toHaveBeenCalledTimes(1);
    const [, prompt] = (bridge.agent.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(prompt).toContain("a punchy hook about burnout");
    expect(prompt).toContain("one");
    // The settings default target length (60s) rides along with the request.
    expect(prompt).toContain("60 seconds");
  });

  it("uses the loaded default duration when settings arrive after add-one-more opens", async () => {
    let resolveSettings: (config: ReturnType<typeof defaultShortPipeConfig>) => void = () =>
      undefined;
    const settingsPromise = new Promise<ReturnType<typeof defaultShortPipeConfig>>((resolve) => {
      resolveSettings = resolve;
    });
    const bridge = stubBridge({
      settings: {
        get: vi.fn(() => settingsPromise),
        update: vi.fn(),
        chooseOutputDir: vi.fn(),
      },
      projects: {
        list: vi.fn(),
        get: vi.fn(async () => projectWithCandidate),
        create: vi.fn(),
        delete: vi.fn(),
        pickSource: vi.fn(),
        revealOutput: vi.fn(),
        probe: vi.fn(async () => projectWithCandidate),
      },
    });
    const { Workspace } = await import("./Workspace");

    await act(async () => {
      root.render(<Workspace projectId="p1" onBack={() => undefined} />);
    });

    const addButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Add one more short"),
    );
    expect(addButton).toBeInstanceOf(HTMLButtonElement);
    act(() => {
      addButton?.click();
    });

    await act(async () => {
      resolveSettings({ ...defaultShortPipeConfig(), defaultTargetDurationSec: 30 });
      await settingsPromise;
    });

    const input = container.querySelector("textarea.add-input") as HTMLTextAreaElement | null;
    expect(input).toBeInstanceOf(HTMLTextAreaElement);
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    act(() => {
      setValue?.call(input, "a fresher angle");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const submit = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Find it"),
    );
    expect(submit).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      submit?.click();
    });

    expect(bridge.agent.send).toHaveBeenCalledTimes(1);
    const [, prompt] = (bridge.agent.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(prompt).toContain("30 seconds");
  });

  it("keeps a user-selected add-one-more duration when settings load later", async () => {
    let resolveSettings: (config: ReturnType<typeof defaultShortPipeConfig>) => void = () =>
      undefined;
    const settingsPromise = new Promise<ReturnType<typeof defaultShortPipeConfig>>((resolve) => {
      resolveSettings = resolve;
    });
    const bridge = stubBridge({
      settings: {
        get: vi.fn(() => settingsPromise),
        update: vi.fn(),
        chooseOutputDir: vi.fn(),
      },
      projects: {
        list: vi.fn(),
        get: vi.fn(async () => projectWithCandidate),
        create: vi.fn(),
        delete: vi.fn(),
        pickSource: vi.fn(),
        revealOutput: vi.fn(),
        probe: vi.fn(async () => projectWithCandidate),
      },
    });
    const { Workspace } = await import("./Workspace");

    await act(async () => {
      root.render(<Workspace projectId="p1" onBack={() => undefined} />);
    });

    const addButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Add one more short"),
    );
    expect(addButton).toBeInstanceOf(HTMLButtonElement);
    act(() => {
      addButton?.click();
    });

    const select = container.querySelector<HTMLSelectElement>("select.duration-select");
    expect(select).toBeInstanceOf(HTMLSelectElement);
    act(() => {
      if (select) {
        select.value = "45";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    await act(async () => {
      resolveSettings({ ...defaultShortPipeConfig(), defaultTargetDurationSec: 30 });
      await settingsPromise;
    });

    const input = container.querySelector("textarea.add-input") as HTMLTextAreaElement | null;
    expect(input).toBeInstanceOf(HTMLTextAreaElement);
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    act(() => {
      setValue?.call(input, "a user-picked duration");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const submit = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Find it"),
    );
    expect(submit).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      submit?.click();
    });

    expect(bridge.agent.send).toHaveBeenCalledTimes(1);
    const [, prompt] = (bridge.agent.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(prompt).toContain("45 seconds");
  });

  it("opens the prompt box from the filmstrip header plus button", async () => {
    stubBridge({
      projects: {
        list: vi.fn(),
        get: vi.fn(async () => projectWithCandidate),
        create: vi.fn(),
        delete: vi.fn(),
        pickSource: vi.fn(),
        revealOutput: vi.fn(),
        probe: vi.fn(async () => projectWithCandidate),
      },
    });
    const { Workspace } = await import("./Workspace");

    await act(async () => {
      root.render(<Workspace projectId="p1" onBack={() => undefined} />);
    });

    expect(container.querySelector("textarea.add-input")).toBeNull();
    const headerPlus = container.querySelector(
      'button[aria-label="Add one more short"]',
    ) as HTMLButtonElement | null;
    expect(headerPlus).toBeInstanceOf(HTMLButtonElement);
    act(() => {
      headerPlus?.click();
    });
    expect(container.querySelector("textarea.add-input")).toBeInstanceOf(HTMLTextAreaElement);
  });

  it("can stop a running add-one-more request when shorts already exist", async () => {
    const bridge = stubBridge({
      projects: {
        list: vi.fn(),
        get: vi.fn(async () => projectWithCandidate),
        create: vi.fn(),
        delete: vi.fn(),
        pickSource: vi.fn(),
        revealOutput: vi.fn(),
        probe: vi.fn(async () => projectWithCandidate),
      },
      agent: {
        history: vi.fn(),
        send: vi.fn(),
        abort: vi.fn(),
        isRunning: vi.fn(async () => true),
      },
    });
    const { Workspace } = await import("./Workspace");

    await act(async () => {
      root.render(<Workspace projectId="p1" onBack={() => undefined} />);
    });

    const stopButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Stop"),
    );
    expect(stopButton).toBeInstanceOf(HTMLButtonElement);
    act(() => {
      stopButton?.click();
    });

    expect(bridge.agent.abort).toHaveBeenCalledWith("p1");
  });
});
