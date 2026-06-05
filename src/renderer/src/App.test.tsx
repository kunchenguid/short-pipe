// @vitest-environment jsdom

import type { ShortPipeApi } from "@shared/ipc";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function stubBridge(overrides: Partial<ShortPipeApi> = {}) {
  const bridge: ShortPipeApi = {
    app: {
      info: vi.fn(),
      getUpdateStatus: vi.fn(async () => ({
        currentVersion: "0.2.0",
        latestVersion: "0.2.0",
        updateAvailable: false,
        releaseUrl: null,
      })),
      openReleasePage: vi.fn(),
    },
    settings: {
      get: vi.fn(async () => ({
        version: 1 as const,
        defaultModel: "openai-codex/gpt-5.5",
        defaultLayout: "center-square" as const,
        defaultTheme: "dark" as const,
        defaultCaptionStyle: "clean" as const,
      })),
      update: vi.fn(),
      chooseOutputDir: vi.fn(),
    },
    auth: {
      status: vi.fn(async () => ({
        authenticated: true,
        storage: { path: "auth.json", encrypted: true },
      })),
      login: vi.fn(),
      logout: vi.fn(),
    },
    projects: {
      list: vi.fn(async () => []),
      get: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      pickSource: vi.fn(),
      revealOutput: vi.fn(),
      probe: vi.fn(),
    },
    transcript: { get: vi.fn(), run: vi.fn() },
    waveform: { peaks: vi.fn(async () => []) },
    candidates: {
      patch: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      remove: vi.fn(),
      render: vi.fn(),
    },
    agent: { history: vi.fn(), send: vi.fn(), abort: vi.fn(), isRunning: vi.fn() },
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

describe("App", () => {
  it("does not show sign out on the authenticated main screen", async () => {
    const bridge = stubBridge();
    const { App } = await import("./App");

    await act(async () => {
      root.render(<App />);
    });

    expect(await bridge.auth.status()).toEqual({
      authenticated: true,
      storage: { path: "auth.json", encrypted: true },
    });
    expect(container.textContent).toContain("Your projects");
    expect(container.textContent).not.toContain("Sign out");
    expect(bridge.auth.logout).not.toHaveBeenCalled();
  });

  it("opens the settings sheet from the topbar gear", async () => {
    const bridge = stubBridge();
    const { App } = await import("./App");

    await act(async () => {
      root.render(<App />);
    });

    expect(container.querySelector(".settings-overlay")).toBeNull();
    const gear = container.querySelector<HTMLButtonElement>('button[aria-label="Settings"]');
    expect(gear).not.toBeNull();
    await act(async () => {
      gear?.click();
    });

    expect(container.querySelector(".settings-overlay")).not.toBeNull();
    expect(bridge.settings.get).toHaveBeenCalled();
  });
});
