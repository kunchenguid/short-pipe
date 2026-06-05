// @vitest-environment jsdom

import type { Candidate } from "@shared/project";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StagePreview } from "./StagePreview";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const candidate: Candidate = {
  id: "c1",
  title: "The Real Reason",
  rank: 1,
  startWordId: "w0",
  endWordId: "w4",
  startTime: 0,
  endTime: 4,
  layout: "center-square",
  captionStyle: "clean",
  titleStyle: "kicker",
  theme: "dark",
  videoFit: "full",
  keywords: [],
  status: "proposed",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount() {
  act(() => root.render(<StagePreview projectId="p1" candidate={candidate} />));
  const phone = container.querySelector(".phone") as HTMLElement;
  const iframe = container.querySelector("iframe") as HTMLIFrameElement;
  // The iframe content window is the postMessage target the driver listens on.
  const post = vi.spyOn(iframe.contentWindow as Window, "postMessage");
  return { phone, iframe, post };
}

describe("StagePreview play/pause", () => {
  it("toggles on pointerdown, not on the focus-stealing click", () => {
    // A cross-origin preview iframe eats the first *click* to transfer focus, so
    // pointerdown - which is delivered on hit-test regardless of focus - must
    // drive the toggle.
    const { phone, post } = mount();
    act(() => {
      phone.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(post).toHaveBeenCalledWith({ __sp: "toggle" }, "*");
  });

  it("does not double-toggle when a mouse click follows the pointerdown", () => {
    const { phone, post } = mount();
    act(() => {
      phone.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      // The browser-synthesised click after a real mouse press carries detail >= 1.
      phone.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
    const toggles = post.mock.calls.filter((c) => (c[0] as { __sp?: string }).__sp === "toggle");
    expect(toggles).toHaveLength(1);
  });

  it("still toggles on keyboard activation (Enter/Space click has detail 0)", () => {
    const { phone, post } = mount();
    act(() => {
      phone.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    });
    expect(post).toHaveBeenCalledWith({ __sp: "toggle" }, "*");
  });
});
