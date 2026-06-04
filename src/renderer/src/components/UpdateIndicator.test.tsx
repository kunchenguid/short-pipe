// @vitest-environment jsdom

import type { UpdateStatus } from "@shared/ipc";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The renderer's `sp` bridge is `window.shortpipe`, read at module load. Stub it
// before importing the component so the import does not blow up under jsdom.
type AppBridge = {
  getUpdateStatus: () => Promise<UpdateStatus>;
  openReleasePage: () => Promise<{ ok: boolean }>;
};

function stubBridge(app: AppBridge) {
  (window as unknown as { shortpipe: { app: AppBridge } }).shortpipe = { app };
}

// React's act() needs this flag set in a non-DOM-test runner.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function mountIndicator() {
  const { UpdateIndicator } = await import("./UpdateIndicator");
  await act(async () => {
    root.render(<UpdateIndicator />);
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

const noUpdate: UpdateStatus = {
  currentVersion: "0.2.0",
  latestVersion: "0.2.0",
  updateAvailable: false,
  releaseUrl: null,
};

const hasUpdate: UpdateStatus = {
  currentVersion: "0.1.0",
  latestVersion: "0.2.0",
  updateAvailable: true,
  releaseUrl: "https://github.com/kunchenguid/short-pipe/releases/latest",
};

describe("UpdateIndicator", () => {
  it("pins the Homebrew upgrade command to the short-pipe cask", async () => {
    const { UPGRADE_COMMAND } = await import("./UpdateIndicator");
    expect(UPGRADE_COMMAND).toBe("brew update && brew upgrade --cask short-pipe");
  });

  it("renders nothing when there is no update", async () => {
    stubBridge({
      getUpdateStatus: vi.fn(async () => noUpdate),
      openReleasePage: vi.fn(async () => ({ ok: true })),
    });
    await mountIndicator();
    expect(container.querySelector(".update-indicator")).toBeNull();
  });

  it("shows the upgrade trigger when an update is available", async () => {
    stubBridge({
      getUpdateStatus: vi.fn(async () => hasUpdate),
      openReleasePage: vi.fn(async () => ({ ok: true })),
    });
    await mountIndicator();
    const trigger = container.querySelector<HTMLButtonElement>(".update-trigger");
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute("aria-label")).toBe("Update available: v0.2.0");
  });

  it("opens the release page when Release notes is clicked", async () => {
    const openReleasePage = vi.fn(async () => ({ ok: true }));
    stubBridge({ getUpdateStatus: vi.fn(async () => hasUpdate), openReleasePage });
    await mountIndicator();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".update-trigger")?.click();
    });
    const notes = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
      b.textContent?.includes("Release notes"),
    );
    expect(notes).toBeTruthy();
    await act(async () => {
      notes?.click();
    });
    expect(openReleasePage).toHaveBeenCalledOnce();
  });
});
