import type {
  Candidate,
  LayoutKind,
  Theme,
  TitleStyle,
  Transcript,
  VideoFit,
} from "@shared/project";
import { CAPTION_STYLES, LAYOUT_KINDS, THEMES, TITLE_STYLES, VIDEO_FITS } from "@shared/project";
import { useState } from "react";
import { formatTime, sp } from "../api";
import { Icon, Pill } from "./Icon";
import { indexOfId } from "./transcriptSelection";

const LAYOUT_LABELS: Record<LayoutKind, string> = {
  "top-square": "Half & half",
  "center-square": "Center",
  "full-bleed": "Full bleed",
};

const TITLE_LABELS: Record<TitleStyle, string> = {
  plain: "Plain",
  kicker: "Kicker",
  masthead: "Masthead",
  eyebrow: "Eyebrow",
};

const THEME_LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
};

const VIDEO_FIT_LABELS: Record<VideoFit, string> = {
  square: "Square",
  full: "Full",
};

function passageOf(transcript: Transcript | null, candidate: Candidate): string | null {
  if (!transcript) return null;
  const words = transcript.words;
  const s = indexOfId(words, candidate.startWordId);
  const e = indexOfId(words, candidate.endWordId);
  if (s < 0 || e < 0) return null;
  return words
    .slice(s, e + 1)
    .map((w) => w.text)
    .join(" ");
}

export function Inspector({
  projectId,
  candidate,
  transcript,
  onTrim,
}: {
  projectId: string;
  candidate: Candidate;
  transcript: Transcript | null;
  onTrim: () => void;
}) {
  const [title, setTitle] = useState(candidate.title);
  const [adding, setAdding] = useState(false);
  const [newKw, setNewKw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const patch = (p: Parameters<typeof sp.candidates.patch>[2]) =>
    call(() => sp.candidates.patch(projectId, candidate.id, p));

  // Legacy candidates stored the old "card" key, which is now the top-square layout.
  const activeLayout: LayoutKind =
    (candidate.layout as string) === "card" ? "top-square" : candidate.layout;
  // Candidates created before title styles existed have no titleStyle; the render
  // defaults them to "kicker", so reflect that in the picker.
  const activeTitleStyle: TitleStyle = candidate.titleStyle ?? "kicker";
  // Likewise, candidates predating themes default to "dark".
  const activeTheme: Theme = candidate.theme ?? "dark";
  const activeVideoFit: VideoFit = candidate.videoFit ?? "full";

  // Export = the one step that produces the .mp4. Approve first (the renderer
  // only renders approved candidates), then render to 1080x1920.
  const exportShort = () =>
    void call(async () => {
      await sp.candidates.approve(projectId, candidate.id);
      await sp.candidates.render(projectId, candidate.id);
    });

  function commitKeyword() {
    const k = newKw.trim();
    setAdding(false);
    setNewKw("");
    if (k && !candidate.keywords.includes(k)) {
      void patch({ keywords: [...candidate.keywords, k] });
    }
  }

  const rendered = candidate.status === "rendered";
  const passage = passageOf(transcript, candidate);
  const dur = Math.max(0, candidate.endTime - candidate.startTime);

  return (
    <div className="pane inspector">
      <div className="pane-head">
        <span className="section-title">Inspector</span>
        <Pill status={candidate.status} />
      </div>
      <div className="insp">
        <input
          className="ttl"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title !== candidate.title) void patch({ title: title.trim() });
            else setTitle(candidate.title);
          }}
        />
        {candidate.reason && <div className="reason">{candidate.reason}</div>}
        <div className="meta-line">
          <span>
            {formatTime(candidate.startTime)} - {formatTime(candidate.endTime)}
          </span>
          <span>-</span>
          <span>{dur.toFixed(1)}s</span>
        </div>

        {/* The passage absorbs the remaining height and scrolls; the panel itself
            stays fixed so the controls and Export are always visible. */}
        <div className="insp-read">
          {passage ? (
            <div className="passage">"{passage}"</div>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>
              Transcribe the video to see this short's passage.
            </span>
          )}
        </div>
        <div className="divider" />

        <div className="field-group">
          <span className="fg-label">Layout</span>
          <div className="seg">
            {LAYOUT_KINDS.map((l) => (
              <button
                type="button"
                key={l}
                className={activeLayout === l ? "on" : ""}
                onClick={() => void patch({ layout: l })}
              >
                {LAYOUT_LABELS[l]}
              </button>
            ))}
          </div>
        </div>
        <div className="field-group">
          <span className="fg-label">Theme</span>
          <div className="seg">
            {THEMES.map((t) => (
              <button
                type="button"
                key={t}
                className={activeTheme === t ? "on" : ""}
                onClick={() => void patch({ theme: t })}
              >
                {THEME_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        {activeLayout !== "full-bleed" && (
          <>
            <div className="field-group">
              <span className="fg-label">Frame</span>
              <div className="seg">
                {VIDEO_FITS.map((f) => (
                  <button
                    type="button"
                    key={f}
                    className={activeVideoFit === f ? "on" : ""}
                    onClick={() => void patch({ videoFit: f })}
                  >
                    {VIDEO_FIT_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field-group">
              <span className="fg-label">Title</span>
              <div className="seg">
                {TITLE_STYLES.map((t) => (
                  <button
                    type="button"
                    key={t}
                    className={activeTitleStyle === t ? "on" : ""}
                    onClick={() => void patch({ titleStyle: t })}
                  >
                    {TITLE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="field-group">
          <span className="fg-label">Captions</span>
          <div className="seg">
            {CAPTION_STYLES.map((c) => (
              <button
                type="button"
                key={c}
                className={candidate.captionStyle === c ? "on" : ""}
                onClick={() => void patch({ captionStyle: c })}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="divider" />

        <div className="field-group">
          <label htmlFor="kw-add-input">Keywords</label>
          <div className="kw-edit">
            {candidate.keywords.map((k) => (
              <span key={k} className="kw-chip">
                {k}
                <button
                  type="button"
                  title={`Remove ${k}`}
                  onClick={() =>
                    void patch({ keywords: candidate.keywords.filter((x) => x !== k) })
                  }
                >
                  <Icon name="x" />
                </button>
              </span>
            ))}
            {adding ? (
              <input
                id="kw-add-input"
                type="text"
                // biome-ignore lint/a11y/noAutofocus: focus the inline keyword field the user just opened
                autoFocus
                value={newKw}
                placeholder="keyword"
                style={{ width: 96 }}
                onChange={(e) => setNewKw(e.target.value)}
                onBlur={commitKeyword}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitKeyword();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setNewKw("");
                  }
                }}
              />
            ) : (
              <button type="button" className="kw-add" onClick={() => setAdding(true)}>
                + add
              </button>
            )}
          </div>
        </div>

        <button type="button" className="btn block" onClick={onTrim}>
          <Icon name="scissors" /> Edit
        </button>
        <div className="divider" />

        <div className="actions">
          {rendered ? (
            <>
              {candidate.renderedPath && (
                <div className="rendered-note">
                  <Icon name="checkCircle" /> {candidate.renderedPath}
                </div>
              )}
              <div className="row2">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void call(() => sp.projects.revealOutput(projectId))}
                >
                  <Icon name="folderOpen" /> Reveal
                </button>
                <button type="button" className="btn" disabled={busy} onClick={exportShort}>
                  <Icon name="rotateCw" /> {busy ? "Exporting..." : "Re-export"}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="btn accent block"
              disabled={busy}
              onClick={exportShort}
            >
              <Icon name="film" /> {busy ? "Exporting 1080x1920..." : "Export 1080x1920"}
            </button>
          )}
        </div>
        {error && <div className="banner error">{error}</div>}
      </div>
    </div>
  );
}
