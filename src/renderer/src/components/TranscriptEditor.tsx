import type { Candidate, Transcript } from "@shared/project";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatTime, sp } from "../api";
import { Icon } from "./Icon";
import {
  clampRange,
  dragEnd,
  dragStart,
  indexOfId,
  nudge,
  type Range,
  rangeBetween,
} from "./transcriptSelection";
import { WaveformTrimmer } from "./WaveformTrimmer";

type Cut = { start: number; end: number };

type DragMode = "new" | "start" | "end" | null;

/**
 * Highlight-to-select trim (the design team's UX upgrade over the old "active
 * boundary" model): the whole manuscript is shown and the clip is a highlighted
 * selection inside it. Drag across the words you want - exactly like quoting a
 * passage - then drag either rounded handle (or use -/+) to nudge an edge.
 */
export function TranscriptEditor({
  projectId,
  transcript,
  candidate,
  sourceDuration,
  onClose,
}: {
  projectId: string;
  transcript: Transcript;
  candidate: Candidate;
  /** Source length in seconds, so the waveform timeline spans the whole video. */
  sourceDuration?: number;
  onClose: () => void;
}) {
  const words = transcript.words;
  const [range, setRange] = useState<Range>(() =>
    clampRange(words, { startId: candidate.startWordId, endId: candidate.endWordId }),
  );
  // The manual waveform cut override, if the user has fine-tuned this candidate.
  const [cut, setCut] = useState<Cut | null>(() =>
    candidate.cutStart != null && candidate.cutEnd != null
      ? { start: candidate.cutStart, end: candidate.cutEnd }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const drag = useRef<DragMode>(null);
  const anchor = useRef<string>(candidate.startWordId);
  const startWordRef = useRef<HTMLSpanElement>(null);

  const startIdx = indexOfId(words, range.startId);
  const endIdx = indexOfId(words, range.endId);

  // Scroll the clip into view when the editor opens.
  useEffect(() => {
    startWordRef.current?.scrollIntoView({ block: "center" });
  }, []);

  // End any drag on mouseup anywhere; restore text selection.
  useEffect(() => {
    const up = () => {
      drag.current = null;
      document.body.style.userSelect = "";
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // Re-selecting words is the "start over" gesture: it drops any manual waveform
  // trim so the clip falls back to word/silence snapping (matches the main process).
  const beginSelect = (id: string) => {
    drag.current = "new";
    anchor.current = id;
    setRange({ startId: id, endId: id });
    setCut(null);
    document.body.style.userSelect = "none";
  };
  const grabHandle = (which: "start" | "end") => (ev: MouseEvent) => {
    ev.stopPropagation();
    drag.current = which;
    setCut(null);
    document.body.style.userSelect = "none";
  };
  const onEnter = (id: string) => {
    if (!drag.current) return;
    setRange((r) => {
      if (drag.current === "new") return rangeBetween(words, anchor.current, id);
      if (drag.current === "start") return dragStart(words, r, id);
      return dragEnd(words, r, id);
    });
  };

  const duration = useMemo(() => {
    if (startIdx < 0 || endIdx < 0) return 0;
    return words[endIdx].end - words[startIdx].start;
  }, [words, startIdx, endIdx]);
  const count = endIdx - startIdx + 1;

  // The waveform handles sit on the manual cut when set, else the word edges.
  const wordStart = words[startIdx]?.start ?? 0;
  const wordEnd = words[endIdx]?.end ?? wordStart;
  const cutValue = cut ?? { start: wordStart, end: wordEnd };
  // Span the whole source; fall back to just past the last word when unknown.
  const timelineDuration = Math.max(sourceDuration ?? 0, words[words.length - 1]?.end ?? 0) + 1;

  async function save() {
    setBusy(true);
    try {
      await sp.candidates.patch(projectId, candidate.id, {
        startWordId: range.startId,
        endWordId: range.endId,
        cutStart: cut?.start,
        cutEnd: cut?.end,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="trim">
      <div className="work-bar">
        <button type="button" className="btn small ghost" onClick={onClose}>
          <Icon name="chevronLeft" /> Back to preview
        </button>
        <span className="section-title" style={{ marginLeft: 8 }}>
          Trim - {candidate.title}
        </span>
        <span className="spacer" />
        <button type="button" className="btn small primary" onClick={save} disabled={busy}>
          <Icon name="check" /> {busy ? "Saving..." : "Save range"}
        </button>
      </div>

      <div className="trim-controls">
        <button
          type="button"
          className="btn small ghost"
          title="One word earlier"
          onClick={() => {
            setRange((r) => nudge(words, r, "start", -1));
            setCut(null);
          }}
        >
          <Icon name="minus" />
        </button>
        <div className="trim-summary">
          <span className="ts-words">
            <strong>{count}</strong> words selected
          </span>
          <span className="ts-dot">-</span>
          <span>
            {formatTime(words[startIdx]?.start)} - {formatTime(words[endIdx]?.end)}
          </span>
          <span className="ts-dot">-</span>
          <span className="ts-dur">{duration.toFixed(1)}s</span>
        </div>
        <button
          type="button"
          className="btn small ghost"
          title="One word later"
          onClick={() => {
            setRange((r) => nudge(words, r, "end", 1));
            setCut(null);
          }}
        >
          <Icon name="plus" />
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <div className="transcript">
          {words.map((w, i) => {
            const inRange = i >= startIdx && i <= endIdx;
            const cls = [
              "word",
              inRange ? "in-range" : "",
              i === startIdx ? "is-start" : "",
              i === endIdx ? "is-end" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: word spans participate in the drag-select gesture
              <span
                key={w.id}
                ref={i === startIdx ? startWordRef : undefined}
                className={cls}
                onMouseDown={() => beginSelect(w.id)}
                onMouseEnter={() => onEnter(w.id)}
              >
                {i === startIdx && (
                  // biome-ignore lint/a11y/noStaticElementInteractions: drag handle for the start edge
                  <span
                    className="grip grip-start"
                    onMouseDown={grabHandle("start")}
                    title="Drag to move the start"
                  />
                )}
                {w.text}
                {i === endIdx && (
                  // biome-ignore lint/a11y/noStaticElementInteractions: drag handle for the end edge
                  <span
                    className="grip grip-end"
                    onMouseDown={grabHandle("end")}
                    title="Drag to move the end"
                  />
                )}{" "}
              </span>
            );
          })}
        </div>
      </div>

      <div className="trim-hint">
        <strong>Drag across the transcript</strong> to pick the words, then fine-tune the exact
        in/out on the waveform below - drag the handles to a silent gap so no word is clipped.
      </div>

      <WaveformTrimmer
        projectId={projectId}
        words={words}
        silences={transcript.silences ?? []}
        sourceDuration={timelineDuration}
        value={cutValue}
        onChange={(start, end) => setCut({ start, end })}
        onReset={() => setCut(null)}
      />
    </div>
  );
}
