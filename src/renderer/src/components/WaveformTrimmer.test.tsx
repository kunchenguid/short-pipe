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
      getUpdateStatus: vi.fn(),
      openReleasePage: vi.fn(),
      openExternal: vi.fn(),
    },
    settings: { get: vi.fn(), update: vi.fn(), chooseOutputDir: vi.fn() },
    auth: { status: vi.fn(), login: vi.fn(), logout: vi.fn() },
    deps: { check: vi.fn(async () => []) },
    projects: {
      list: vi.fn(),
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
    agent: { history: vi.fn(), send: vi.fn(), abort: vi.fn(), isRunning: vi.fn(async () => false) },
    events: { on: vi.fn(() => () => undefined) },
    ...overrides,
  };
  window.shortpipe = bridge;
  return bridge;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 500 });
  window.ResizeObserver = class ResizeObserver {
    readonly #callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.#callback = callback;
    }

    observe() {
      this.#callback([], this);
    }

    unobserve() {}

    disconnect() {}
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () =>
      ({
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        restore: vi.fn(),
        save: vi.fn(),
        setTransform: vi.fn(),
      }) as unknown as CanvasRenderingContext2D,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("WaveformTrimmer", () => {
  it("does not start a second peaks request while one is in flight", async () => {
    let resolveFirst: ((values: number[]) => void) | undefined;
    const peaks = vi.fn(
      () =>
        new Promise<number[]>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    stubBridge({ waveform: { peaks } });
    const { WaveformTrimmer } = await import("./WaveformTrimmer");

    await act(async () => {
      root.render(
        <WaveformTrimmer
          projectId="p1"
          words={[]}
          silences={[]}
          sourceDuration={120}
          value={{ start: 10, end: 20 }}
          onChange={() => undefined}
          onReset={() => undefined}
        />,
      );
    });

    act(() => vi.advanceTimersByTime(60));
    expect(peaks).toHaveBeenCalledTimes(1);

    const scroll = container.querySelector(".waveform-scroll") as HTMLDivElement;
    await act(async () => {
      scroll.scrollLeft = 1000;
      scroll.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    act(() => vi.advanceTimersByTime(60));

    expect(peaks).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst?.([]);
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(60));

    expect(peaks).toHaveBeenCalledTimes(2);
  });
});
