// @vitest-environment jsdom

import type { AppEvent } from "@shared/events";
import type { ShortPipeApi } from "@shared/ipc";
import type { Candidate } from "@shared/project";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const candidate: Candidate = {
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

function stubBridge(overrides: Partial<ShortPipeApi> = {}): {
  bridge: ShortPipeApi;
  emit: (event: AppEvent) => void;
} {
  let listener: ((event: AppEvent) => void) | null = null;
  const bridge = {
    candidates: {
      patch: vi.fn(),
      approve: vi.fn(async () => undefined),
      reject: vi.fn(),
      remove: vi.fn(),
      // Never resolves, so the export stays "busy" while we assert the bar.
      render: vi.fn(() => new Promise(() => undefined)),
    },
    projects: { revealOutput: vi.fn() },
    events: {
      on: vi.fn((l: (event: AppEvent) => void) => {
        listener = l;
        return () => {
          listener = null;
        };
      }),
    },
    ...overrides,
  } as unknown as ShortPipeApi;
  window.shortpipe = bridge;
  return { bridge, emit: (event) => listener?.(event) };
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

async function mountInspector() {
  const { Inspector } = await import("./Inspector");
  await act(async () => {
    root.render(
      <Inspector projectId="p1" candidate={candidate} transcript={null} onTrim={() => undefined} />,
    );
  });
}

function exportButton(): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Export"),
  );
  if (!btn) throw new Error("export button not found");
  return btn as HTMLButtonElement;
}

describe("Inspector export progress", () => {
  it("fills the export button as render_progress events arrive", async () => {
    const { emit } = stubBridge();
    await mountInspector();

    await act(async () => exportButton().click());

    // Mid-render progress paints a fill whose width tracks the percentage.
    await act(async () => {
      emit({ type: "render_progress", projectId: "p1", candidateId: "c1", percent: 42 });
    });
    const fill = container.querySelector<HTMLElement>(".progress-fill");
    expect(fill).not.toBeNull();
    expect(fill?.style.width).toBe("42%");
    expect(exportButton().textContent).toContain("42%");
  });

  it("ignores progress for a different candidate", async () => {
    const { emit } = stubBridge();
    await mountInspector();
    await act(async () => exportButton().click());

    await act(async () => {
      emit({ type: "render_progress", projectId: "p1", candidateId: "other", percent: 80 });
    });
    const fill = container.querySelector<HTMLElement>(".progress-fill");
    expect(fill?.style.width ?? "0%").toBe("0%");
  });
});
