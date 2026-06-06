// @vitest-environment jsdom

import type { ShortPipeConfig } from "@shared/config";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type SettingsBridge = {
  get: () => Promise<ShortPipeConfig>;
  update: (patch: Partial<ShortPipeConfig>) => Promise<ShortPipeConfig>;
  chooseOutputDir: () => Promise<ShortPipeConfig>;
};

function stubBridge(settings: SettingsBridge) {
  (
    window as unknown as {
      shortpipe: {
        settings: SettingsBridge;
        deps: { check: () => Promise<unknown[]> };
        app: { openExternal: () => Promise<{ ok: boolean }> };
      };
    }
  ).shortpipe = {
    settings,
    deps: { check: vi.fn(async () => []) },
    app: { openExternal: vi.fn(async () => ({ ok: true })) },
  };
}

const baseConfig: ShortPipeConfig = {
  version: 1,
  defaultModel: "openai-codex/gpt-5.5",
  defaultLayout: "center-square",
  defaultTheme: "dark",
  defaultCaptionStyle: "clean",
  defaultTargetDurationSec: 60,
};

let container: HTMLDivElement;
let root: Root;

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

async function mount(settings: SettingsBridge, onSignOut: () => void = () => undefined) {
  stubBridge(settings);
  const { Settings } = await import("./Settings");
  await act(async () => {
    root.render(<Settings onClose={() => undefined} onSignOut={onSignOut} />);
  });
}

describe("Settings", () => {
  it("shows the per-project placeholder when no default output dir is set", async () => {
    await mount({
      get: vi.fn(async () => baseConfig),
      update: vi.fn(),
      chooseOutputDir: vi.fn(),
    });
    expect(container.textContent).toContain("Each project's own folder");
  });

  it("shows the configured default output dir", async () => {
    await mount({
      get: vi.fn(async () => ({ ...baseConfig, defaultOutputDir: "/Users/kun/Shorts" })),
      update: vi.fn(),
      chooseOutputDir: vi.fn(),
    });
    expect(container.textContent).toContain("/Users/kun/Shorts");
  });

  it("patches the default layout when a layout option is clicked", async () => {
    const update = vi.fn(async () => ({ ...baseConfig, defaultLayout: "full-bleed" as const }));
    await mount({ get: vi.fn(async () => baseConfig), update, chooseOutputDir: vi.fn() });

    const fullBleed = Array.from(container.querySelectorAll<HTMLButtonElement>(".seg button")).find(
      (b) => b.textContent === "Full bleed",
    );
    expect(fullBleed).toBeTruthy();
    await act(async () => {
      fullBleed?.click();
    });
    expect(update).toHaveBeenCalledWith({ defaultLayout: "full-bleed" });
  });

  it("patches the default target length when a duration option is clicked", async () => {
    const update = vi.fn(async () => ({ ...baseConfig, defaultTargetDurationSec: 30 }));
    await mount({ get: vi.fn(async () => baseConfig), update, chooseOutputDir: vi.fn() });

    const thirty = Array.from(container.querySelectorAll<HTMLButtonElement>(".seg button")).find(
      (b) => b.textContent === "~30s",
    );
    expect(thirty).toBeTruthy();
    await act(async () => {
      thirty?.click();
    });
    expect(update).toHaveBeenCalledWith({ defaultTargetDurationSec: 30 });
  });

  it("shows the on-device tools checklist", async () => {
    await mount({
      get: vi.fn(async () => baseConfig),
      update: vi.fn(),
      chooseOutputDir: vi.fn(),
    });
    expect(container.textContent).toContain("On-device tools");
  });

  it("signs out of Codex when Disconnect is clicked", async () => {
    const onSignOut = vi.fn();
    await mount(
      { get: vi.fn(async () => baseConfig), update: vi.fn(), chooseOutputDir: vi.fn() },
      onSignOut,
    );

    const disconnect = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent?.includes("Disconnect"),
    );
    expect(disconnect).toBeTruthy();
    await act(async () => {
      disconnect?.click();
    });
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
