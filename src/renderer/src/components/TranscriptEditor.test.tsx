// @vitest-environment jsdom

import type { ShortPipeApi } from "@shared/ipc";
import type { Candidate, Transcript } from "@shared/project";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const transcript: Transcript = {
  words: [
    { id: "w0", text: "The", start: 1.0, end: 1.2 },
    { id: "w1", text: "real", start: 1.2, end: 1.6 },
    { id: "w2", text: "reason", start: 1.6, end: 2.2 },
    { id: "w3", text: "is", start: 2.2, end: 2.4 },
    { id: "w4", text: "money.", start: 2.4, end: 3.0 },
  ],
  silences: [{ start: 0.6, end: 1.0 }],
};

const candidate: Candidate = {
  id: "c1",
  title: "The real reason",
  rank: 1,
  startWordId: "w1",
  endWordId: "w3",
  startTime: 1.2,
  endTime: 2.4,
  layout: "center-square",
  captionStyle: "clean",
  titleStyle: "kicker",
  theme: "dark",
  videoFit: "full",
  keywords: [],
  status: "proposed",
};

const patch = vi.fn(async () => ({}) as never);
const peaks = vi.fn(async (_p: string, _from: number, _to: number, bins: number) =>
  new Array(Math.max(0, bins)).fill(0.5),
);

function installBridge() {
  window.shortpipe = {
    candidates: { patch },
    waveform: { peaks },
  } as unknown as ShortPipeApi;
}

beforeEach(() => {
  vi.resetModules();
  patch.mockClear();
  peaks.mockClear();
  installBridge();

  // jsdom lacks these browser APIs the waveform relies on; stub them so the
  // component renders and the drag math sees a real viewport.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  HTMLElement.prototype.scrollIntoView = () => {};
  HTMLCanvasElement.prototype.getContext = () => null as never;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 600 });
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ left: 0, right: 600, top: 0, bottom: 96, width: 600, height: 96 }) as DOMRect;

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = (ms = 120) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

describe("TranscriptEditor waveform trimmer", () => {
  it("renders the waveform timeline and fetches peaks for the visible window", async () => {
    const { TranscriptEditor } = await import("./TranscriptEditor");
    await act(async () => {
      root.render(
        <TranscriptEditor
          projectId="p1"
          transcript={transcript}
          candidate={candidate}
          sourceDuration={30}
          onClose={() => undefined}
        />,
      );
    });
    await flush();

    expect(container.querySelector(".waveform-trim")).not.toBeNull();
    expect(container.querySelector('input[type="range"]')).not.toBeNull();
    expect(container.querySelector(".wf-handle-start")).not.toBeNull();
    expect(container.querySelector(".wf-handle-end")).not.toBeNull();
    // Peaks were requested for a positive window.
    expect(peaks).toHaveBeenCalled();
    const [, from, to, bins] = peaks.mock.calls[0];
    expect(to).toBeGreaterThan(from);
    expect(bins).toBeGreaterThan(0);
  });

  it("uses the known source duration without fallback padding", async () => {
    const { TranscriptEditor } = await import("./TranscriptEditor");
    await act(async () => {
      root.render(
        <TranscriptEditor
          projectId="p1"
          transcript={transcript}
          candidate={candidate}
          sourceDuration={30}
          onClose={() => undefined}
        />,
      );
    });
    await flush();

    const endHandle = container.querySelector('.wf-handle-end[role="slider"]') as HTMLElement;
    expect(endHandle.getAttribute("aria-valuemax")).toBe("30");
  });

  it("saves a manual cut override after dragging the end handle", async () => {
    const { TranscriptEditor } = await import("./TranscriptEditor");
    await act(async () => {
      root.render(
        <TranscriptEditor
          projectId="p1"
          transcript={transcript}
          candidate={candidate}
          sourceDuration={30}
          onClose={() => undefined}
        />,
      );
    });
    await flush();

    const endHandle = container.querySelector(".wf-handle-end") as HTMLElement;
    expect(endHandle).not.toBeNull();

    // The timeline opens at a word-legible zoom (~120px/s for this transcript)
    // with scrollLeft 0, so x=480px maps to 4.0s. Drag the end handle there.
    await act(async () => {
      endHandle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 288 }));
      window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 480 }));
      window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    });

    expect(container.querySelector(".waveform-trim")?.textContent).toContain("0:04.");

    const saveButton = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Save range"),
    ) as HTMLButtonElement;
    await act(async () => {
      saveButton.click();
    });

    expect(patch).toHaveBeenCalledTimes(1);
    const [, , payload] = patch.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, number>,
    ];
    expect(payload.cutStart).toBeCloseTo(0.96, 5);
    expect(payload.cutEnd).toBeGreaterThan(3.5);
    expect(payload.cutEnd).toBeLessThan(4.5);
  });

  it("drops the override when the word selection changes (nudge)", async () => {
    const withCut: Candidate = { ...candidate, cutStart: 1.1, cutEnd: 2.3 };
    const { TranscriptEditor } = await import("./TranscriptEditor");
    await act(async () => {
      root.render(
        <TranscriptEditor
          projectId="p1"
          transcript={transcript}
          candidate={withCut}
          sourceDuration={30}
          onClose={() => undefined}
        />,
      );
    });
    await flush();

    // Nudge the end one word later - this is the "start over" gesture.
    const nudgeLater = [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("title") === "One word later",
    ) as HTMLButtonElement;
    await act(async () => {
      nudgeLater.click();
    });

    const saveButton = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Save range"),
    ) as HTMLButtonElement;
    await act(async () => {
      saveButton.click();
    });

    const [, , payload] = patch.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, number | undefined>,
    ];
    expect(payload.cutStart).toBeUndefined();
    expect(payload.cutEnd).toBeUndefined();
  });
});
