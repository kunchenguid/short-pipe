import type { Candidate } from "@shared/project";
import { useEffect, useRef, useState } from "react";
import { formatTime } from "../api";
import { Icon } from "./Icon";

type SpMessage =
  | { __sp: "progress"; t: number; dur: number; playing: boolean }
  | { __sp: "ready"; dur: number };

/**
 * Live 9:16 preview. Embeds the exact render composition (footage cropped/trimmed
 * to the clip, captions burned over it) served from sp-media:// and scaled into
 * the phone. The frame loops the clip and reports playback over postMessage; the
 * play button and scrubber drive it the same way. Flipping layout/caption/
 * keywords or retrimming changes the URL, so the preview rebuilds to match.
 */
export function StagePreview({
  projectId,
  candidate,
}: {
  projectId: string;
  candidate: Candidate;
}) {
  const [playing, setPlaying] = useState(false);
  const [frac, setFrac] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The actual (padded) clip length comes from the preview driver; until it
  // reports, fall back to the word-range duration.
  const wordRangeDur = Math.max(0, candidate.endTime - candidate.startTime);
  const [dur, setDur] = useState(wordRangeDur);

  const params = new URLSearchParams({
    layout: candidate.layout,
    caption: candidate.captionStyle,
    title: candidate.titleStyle ?? "kicker",
    head: candidate.title,
    theme: candidate.theme ?? "light",
    fit: candidate.videoFit ?? "square",
    kw: candidate.keywords.join(","),
    s: String(candidate.startTime),
    e: String(candidate.endTime),
  });
  const src = `sp-media://frame/${projectId}/${candidate.id}?${params.toString()}`;

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data as SpMessage | undefined;
      if (!d || typeof d !== "object") return;
      if (d.__sp === "progress") {
        setFrac(d.dur ? d.t / d.dur : 0);
        setPlaying(Boolean(d.playing));
        if (d.dur) setDur(d.dur);
      } else if (d.__sp === "ready") {
        setPlaying(false);
        setFrac(0);
        if (d.dur) setDur(d.dur);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // The iframe reloads whenever the previewed clip/style changes (src changes).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on src change
  useEffect(() => {
    setPlaying(false);
    setFrac(0);
    setDur(wordRangeDur);
  }, [src]);

  const post = (msg: Record<string, unknown>) =>
    frameRef.current?.contentWindow?.postMessage(msg, "*");

  function seek(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const r = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    post({ __sp: "seek", t: r * dur });
  }

  return (
    <div className="stage-scroll">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* The whole phone is the play/pause target; the iframe is click-through. */}
        <button
          type="button"
          className="phone"
          onClick={() => post({ __sp: "toggle" })}
          aria-label={playing ? "Pause preview" : "Play preview"}
        >
          <iframe
            ref={frameRef}
            className="pv-frame"
            src={src}
            title="Live preview"
            allow="autoplay"
          />
          <span className={`play-ind${playing ? " playing" : ""}`}>
            <Icon name={playing ? "pause" : "play"} />
          </span>
        </button>
        <div className="scrubber">
          <span className="tc">{formatTime(frac * dur)}</span>
          <button type="button" className="track" onClick={seek} aria-label="Seek preview">
            <div className="fill" style={{ width: `${frac * 100}%` }} />
          </button>
          <span className="tc">{dur.toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
}
