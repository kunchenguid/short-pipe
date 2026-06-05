// @vitest-environment jsdom

import type { DependencyStatus } from "@shared/deps";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DepsBridge = { check: () => Promise<DependencyStatus[]> };
type AppBridge = { openExternal: (url: string) => Promise<{ ok: boolean }> };

function stubBridge(deps: DepsBridge, app: AppBridge) {
  (window as unknown as { shortpipe: { deps: DepsBridge; app: AppBridge } }).shortpipe = {
    deps,
    app,
  };
}

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function mount() {
  const { DependencyChecklist } = await import("./DependencyChecklist");
  await act(async () => {
    root.render(<DependencyChecklist />);
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.resetModules();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const ffmpeg: DependencyStatus = {
  id: "ffmpeg",
  label: "FFmpeg",
  description: "Decodes audio.",
  available: true,
  version: "6.1.1",
  installCommand: "brew install ffmpeg",
  setupUrl: "https://ffmpeg.org/download.html",
};

const hyperframes: DependencyStatus = {
  id: "hyperframes",
  label: "HyperFrames CLI",
  description: "Transcribes and renders.",
  available: false,
  version: null,
  installCommand: "npm install -g hyperframes",
  setupUrl: "https://github.com/heygen-com/hyperframes",
};

describe("DependencyChecklist", () => {
  it("shows an available tool's version and no setup hint", async () => {
    stubBridge({ check: vi.fn(async () => [ffmpeg]) }, { openExternal: vi.fn() });
    await mount();
    expect(container.textContent).toContain("FFmpeg");
    expect(container.textContent).toContain("6.1.1");
    expect(container.querySelector(".dep-cmd")).toBeNull();
  });

  it("shows the install command and setup link for a missing tool", async () => {
    stubBridge({ check: vi.fn(async () => [hyperframes]) }, { openExternal: vi.fn() });
    await mount();
    expect(container.querySelector(".dep-cmd")?.textContent).toBe("npm install -g hyperframes");
    expect(container.querySelector(".dep-row.missing")).not.toBeNull();
  });

  it("opens the setup URL when the guide link is clicked", async () => {
    const openExternal = vi.fn(async () => ({ ok: true }));
    stubBridge({ check: vi.fn(async () => [hyperframes]) }, { openExternal });
    await mount();
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".dep-link")?.click();
    });
    expect(openExternal).toHaveBeenCalledWith("https://github.com/heygen-com/hyperframes");
  });

  it("summarizes how many tools are missing", async () => {
    stubBridge({ check: vi.fn(async () => [ffmpeg, hyperframes]) }, { openExternal: vi.fn() });
    await mount();
    expect(container.textContent).toContain("1 missing");
  });

  it("re-probes when Re-check is clicked, reflecting a newly-installed tool", async () => {
    const check = vi
      .fn<() => Promise<DependencyStatus[]>>()
      .mockResolvedValueOnce([hyperframes]) // first probe: missing
      .mockResolvedValueOnce([{ ...hyperframes, available: true, version: "0.6.73" }]); // after install
    stubBridge({ check }, { openExternal: vi.fn() });
    await mount();
    expect(container.querySelector(".dep-row.missing")).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".dep-recheck")?.click();
    });
    expect(check).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".dep-row.missing")).toBeNull();
    expect(container.textContent).toContain("0.6.73");
  });

  it("re-probes when the window regains focus", async () => {
    const check = vi.fn(async () => [ffmpeg]);
    stubBridge({ check }, { openExternal: vi.fn() });
    await mount();
    expect(check).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("reports an error instead of all set when dependency probing fails", async () => {
    stubBridge(
      { check: vi.fn(async () => Promise.reject(new Error("ipc failed"))) },
      { openExternal: vi.fn() },
    );
    await mount();
    expect(container.textContent).toContain("Unable to check tools");
    expect(container.textContent).not.toContain("All set");
  });

  it("keeps the newest result when dependency probes resolve out of order", async () => {
    let resolveInitial: (deps: DependencyStatus[]) => void = () => undefined;
    let resolveRecheck: (deps: DependencyStatus[]) => void = () => undefined;
    const check = vi
      .fn<() => Promise<DependencyStatus[]>>()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveInitial = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveRecheck = resolve)));
    stubBridge({ check }, { openExternal: vi.fn() });

    await mount();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await act(async () => {
      resolveRecheck([{ ...hyperframes, available: true, version: "0.6.73" }]);
    });
    expect(container.textContent).toContain("0.6.73");

    await act(async () => {
      resolveInitial([hyperframes]);
    });
    expect(container.querySelector(".dep-row.missing")).toBeNull();
    expect(container.textContent).toContain("0.6.73");
  });
});
