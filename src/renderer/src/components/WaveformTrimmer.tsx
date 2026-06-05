import type { Silence, TranscriptWord } from "@shared/project";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { sp } from "../api";
import { Icon } from "./Icon";
import {
  anchorScrollForZoom,
  BAR_PX,
  binsForWidth,
  clampDraggedHandle,
  DEFAULT_PX_PER_SEC,
  fitPxPerSec,
  MAX_PX_PER_SEC,
  medianWordDuration,
  timeToX,
  visibleWindow,
  wordsLegiblePxPerSec,
  xToTime,
} from "./waveformView";

const HEIGHT = 96;
/** Auto-pan the scroll when a handle is dragged within this many px of an edge. */
const PAN_EDGE_PX = 28;

type Cut = { start: number; end: number };
type Peaks = { from: number; to: number; values: number[] };

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

/**
 * Premiere-style waveform trimmer pinned to the bottom of the trim editor. The
 * timeline spans the whole source at a fixed default scale, with a zoom slider
 * and horizontal scroll; two handles set the precise in/out, drawn over the
 * source waveform with the detected silences and word boundaries as guides. The
 * handle times are reported up via `onChange` and become the candidate's manual
 * cut override on save. Free drag - no snapping (the silences are visual only).
 */
export function WaveformTrimmer({
  projectId,
  words,
  silences,
  sourceDuration,
  value,
  onChange,
  onReset,
}: {
  projectId: string;
  words: TranscriptWord[];
  silences: Silence[];
  sourceDuration: number;
  value: Cut;
  onChange: (start: number, end: number) => void;
  onReset: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<"start" | "end" | null>(null);
  // A scroll position staged to apply *after* a zoom changes the content width -
  // setting scrollLeft in the same tick clamps it to the old (un-resized) width.
  const pendingScroll = useRef<number | null>(null);
  const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC);
  const [viewport, setViewport] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [peaks, setPeaks] = useState<Peaks | null>(null);

  const duration = Math.max(sourceDuration, value.end, 0.1);
  // Min zoom fits the whole clip in the viewport; zoom in up to MAX from there.
  const fitPx = fitPxPerSec(viewport, duration);
  const maxPx = Math.max(MAX_PX_PER_SEC, fitPx);
  const contentWidth = Math.max(viewport, Math.ceil(timeToX(duration, pxPerSec)));

  // Keep the canvas backing store matched to the measured viewport.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewport(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Apply a staged scroll once the content has re-laid-out at the new scale (runs
  // after DOM mutation, before paint - so no clamp to the stale width, no flicker).
  // biome-ignore lint/correctness/useExhaustiveDependencies: pxPerSec/viewport are the resize triggers we deliberately re-run on
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || pendingScroll.current === null) return;
    el.scrollLeft = pendingScroll.current;
    pendingScroll.current = null;
    setScrollLeft(el.scrollLeft);
  }, [pxPerSec, viewport]);

  // Once the viewport is known, open at a word-legible zoom with the end handle
  // centered. The user can then zoom out to fit or in for finer control.
  const inited = useRef(false);
  useEffect(() => {
    if (inited.current || viewport === 0) return;
    inited.current = true;
    const median = medianWordDuration(words, value.start, value.end);
    const initialPx = wordsLegiblePxPerSec(median, fitPx, maxPx);
    pendingScroll.current = Math.max(0, timeToX(value.end, initialPx) - viewport / 2);
    setPxPerSec(initialPx);
  }, [viewport, words, value.start, value.end, fitPx, maxPx]);

  // Fetch peaks for just the visible window (debounced) whenever it changes.
  useEffect(() => {
    if (viewport === 0 || duration <= 0) return;
    const { from, to } = visibleWindow(scrollLeft, viewport, pxPerSec, duration);
    const bins = binsForWidth(timeToX(to - from, pxPerSec));
    if (bins <= 0 || to <= from) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      sp.waveform
        .peaks(projectId, from, to, bins)
        .then((values) => {
          if (!cancelled) setPeaks({ from, to, values });
        })
        .catch(() => {});
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [projectId, scrollLeft, viewport, pxPerSec, duration]);

  // Redraw on every relevant change (scroll, zoom, new peaks, handle move). No
  // dependency array on purpose: the draw reads the latest state each render.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(viewport * dpr));
    canvas.height = Math.floor(HEIGHT * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewport, HEIGHT);

    const styles = getComputedStyle(canvas);
    const barColor = styles.getPropertyValue("--ink-4").trim() || "#bbb";
    const selBarColor = styles.getPropertyValue("--vermillion").trim() || "#c8341a";
    const silenceColor = styles.getPropertyValue("--mute-wash").trim() || "rgba(0,0,0,0.05)";
    const tickColor = styles.getPropertyValue("--line").trim() || "#ddd";
    const labelColor = styles.getPropertyValue("--ink-4").trim() || "#aaa";
    const mid = HEIGHT / 2;
    const visFrom = xToTime(scrollLeft, pxPerSec);
    const visTo = xToTime(scrollLeft + viewport, pxPerSec);
    const selX0 = timeToX(value.start, pxPerSec) - scrollLeft;
    const selX1 = timeToX(value.end, pxPerSec) - scrollLeft;

    // Detected silences as faint bands (visual guide only - no snapping).
    ctx.fillStyle = silenceColor;
    for (const s of silences) {
      if (s.end < visFrom || s.start > visTo) continue;
      const x0 = timeToX(s.start, pxPerSec) - scrollLeft;
      const x1 = timeToX(s.end, pxPerSec) - scrollLeft;
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), HEIGHT);
    }

    // Selected range: a faint tint *behind* the bars so the waveform stays
    // legible inside the selection (the bars are recoloured below, not hidden).
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = selBarColor;
    ctx.fillRect(selX0, 0, Math.max(0, selX1 - selX0), HEIGHT);
    ctx.restore();

    // Waveform peak bars: selected bars in the accent colour, the rest muted.
    // sqrt lifts quiet speech so the shape reads at a glance.
    if (peaks?.values.length) {
      const span = peaks.to - peaks.from || 1;
      const n = peaks.values.length;
      const maxH = HEIGHT - 18;
      for (let i = 0; i < n; i++) {
        const t = peaks.from + (i / n) * span;
        const x = timeToX(t, pxPerSec) - scrollLeft;
        if (x < -BAR_PX || x > viewport) continue;
        const h = Math.max(1, Math.sqrt(peaks.values[i]) * maxH);
        ctx.fillStyle = t >= value.start && t <= value.end ? selBarColor : barColor;
        ctx.fillRect(x, mid - h / 2, Math.max(1, BAR_PX - 1), h);
      }
    }

    // Word boundaries: ticks only where they aren't a dense blur, labels when
    // there is real room (skipped entirely when zoomed out).
    ctx.font = "10px var(--font-ui, sans-serif)";
    ctx.textBaseline = "bottom";
    for (const w of words) {
      if (w.end < visFrom || w.start > visTo) continue;
      const widthPx = timeToX(w.end - w.start, pxPerSec);
      if (widthPx < 16) continue;
      const x = timeToX(w.start, pxPerSec) - scrollLeft;
      ctx.fillStyle = tickColor;
      ctx.fillRect(x, HEIGHT - 13, 1, 13);
      if (widthPx > 34) {
        ctx.fillStyle = labelColor;
        ctx.fillText(w.text, x + 3, HEIGHT - 2);
      }
    }
  });

  // Window-level drag: a handle keeps tracking even if the pointer leaves it.
  useEffect(() => {
    function move(e: PointerEvent) {
      const which = drag.current;
      const el = scrollRef.current;
      if (!which || !el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left + el.scrollLeft;
      const other = which === "start" ? value.end : value.start;
      const t = clampDraggedHandle(which, xToTime(x, pxPerSec), other, duration);
      if (which === "start") onChange(t, value.end);
      else onChange(value.start, t);
      // Auto-pan when dragging against an edge, like a real timeline.
      if (e.clientX > rect.right - PAN_EDGE_PX) el.scrollLeft += 10;
      else if (e.clientX < rect.left + PAN_EDGE_PX) el.scrollLeft -= 10;
    }
    function up() {
      drag.current = null;
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [pxPerSec, duration, value.start, value.end, onChange]);

  const beginDrag = (which: "start" | "end") => (e: ReactPointerEvent) => {
    e.preventDefault();
    drag.current = which;
    document.body.style.userSelect = "none";
  };

  function zoomTo(next: number) {
    const clamped = Math.min(maxPx, Math.max(fitPx, next));
    const el = scrollRef.current;
    if (el && viewport > 0) {
      // Keep the time under the viewport centre fixed, so zooming feels anchored
      // rather than jumping. Applied by the layout effect after the resize.
      pendingScroll.current = anchorScrollForZoom(el.scrollLeft, viewport, pxPerSec, clamped);
    }
    setPxPerSec(clamped);
  }

  const startX = timeToX(value.start, pxPerSec);
  const endX = timeToX(value.end, pxPerSec);

  return (
    <div className="waveform-trim">
      <div className="waveform-controls">
        <button
          type="button"
          className="btn small ghost"
          onClick={onReset}
          title="Clear the manual trim and snap to the words"
        >
          <Icon name="rotateCw" /> Reset to words
        </button>
        <label className="wf-zoom">
          <span className="wf-zoom-label">Zoom</span>
          <input
            type="range"
            min={fitPx}
            max={maxPx}
            step="any"
            value={pxPerSec}
            onChange={(e) => zoomTo(Number(e.currentTarget.value))}
            aria-label="Zoom the waveform"
          />
        </label>
        <span className="wf-readout">
          {fmt(value.start)} <span className="ts-dot">-&gt;</span> {fmt(value.end)}
          <span className="ts-dot">-</span>
          <span className="ts-dur">{(value.end - value.start).toFixed(2)}s</span>
        </span>
      </div>
      <div
        className="waveform-scroll"
        ref={scrollRef}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      >
        <div className="waveform-content" style={{ width: contentWidth, height: HEIGHT }}>
          <canvas
            ref={canvasRef}
            className="waveform-canvas"
            style={{ width: viewport, height: HEIGHT }}
          />
          <div
            role="slider"
            aria-label="Clip start"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={value.start}
            tabIndex={0}
            className="wf-handle wf-handle-start"
            style={{ left: startX }}
            onPointerDown={beginDrag("start")}
            title="Drag to set the start"
          />
          <div
            role="slider"
            aria-label="Clip end"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={value.end}
            tabIndex={0}
            className="wf-handle wf-handle-end"
            style={{ left: endX }}
            onPointerDown={beginDrag("end")}
            title="Drag to set the end"
          />
        </div>
      </div>
    </div>
  );
}
