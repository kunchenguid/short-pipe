import type { Candidate } from "@shared/project";
import { useState } from "react";
import { formatTime } from "../api";
import { Icon, Pill, Spinner } from "./Icon";

function Clip({
  candidate,
  active,
  onSelect,
  onRemove,
}: {
  candidate: Candidate;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const dur = Math.max(0, candidate.endTime - candidate.startTime);
  return (
    <div className="clip-wrap">
      <button type="button" className={`clip${active ? " active" : ""}`} onClick={onSelect}>
        <div className={`clip-poster${candidate.layout !== "full-bleed" ? " card-layout" : ""}`}>
          <span className="rnk">{candidate.rank}</span>
          <span className="mini-cap">{candidate.keywords[0] ?? candidate.title.split(" ")[0]}</span>
        </div>
        <div className="clip-info">
          <span className="ct">{candidate.title}</span>
          <span className="cm">
            {formatTime(candidate.startTime)}-{formatTime(candidate.endTime)} - {dur.toFixed(1)}s
          </span>
          <Pill status={candidate.status} />
        </div>
      </button>
      <button
        type="button"
        className="clip-x"
        onClick={onRemove}
        title="Remove from queue"
        aria-label={`Remove "${candidate.title}" from queue`}
      >
        <Icon name="x" />
      </button>
    </div>
  );
}

/**
 * The "add one more short" footer in the filmstrip. The prompt text is sent to
 * the agent so it proposes exactly one additional short. While the agent is busy
 * (whether from here, the header plus, or the empty-state run) it shows progress
 * instead, since the agent works one prompt at a time.
 */
function AddShort({
  running,
  step,
  adding,
  setAdding,
  onAddShort,
}: {
  running: boolean;
  step: string | null;
  adding: boolean;
  setAdding: (adding: boolean) => void;
  onAddShort: (prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState("");

  function cancel() {
    setAdding(false);
    setPrompt("");
  }

  function submit() {
    const text = prompt.trim();
    if (!text) return;
    onAddShort(text);
    setPrompt("");
    setAdding(false);
  }

  if (running) {
    return (
      <div className="strip-foot">
        <div className="add-running">
          <Spinner /> {step ?? "Working..."}
        </div>
      </div>
    );
  }

  if (!adding) {
    return (
      <div className="strip-foot">
        <button type="button" className="add-short" onClick={() => setAdding(true)}>
          <Icon name="plus" /> Add one more short
        </button>
      </div>
    );
  }

  return (
    <div className="strip-foot">
      <div className="add-form">
        <textarea
          // biome-ignore lint/a11y/noAutofocus: the box only mounts on an explicit user click
          autoFocus
          className="add-input"
          rows={3}
          placeholder="What should this short be about? e.g. the strongest hook about burnout"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              cancel();
            }
          }}
        />
        <div className="add-actions">
          <button type="button" className="btn small ghost" onClick={cancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn small primary"
            onClick={submit}
            disabled={!prompt.trim()}
          >
            <Icon name="sparkles" /> Find it
          </button>
        </div>
      </div>
    </div>
  );
}

export function Filmstrip({
  candidates,
  selectedId,
  onSelect,
  onRemove,
  onAddShort,
  running,
  step,
}: {
  candidates: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAddShort: (prompt: string) => void;
  running: boolean;
  step: string | null;
}) {
  // The prompt box is shared by two entry points - the header plus and the
  // footer button - so its open state lives here.
  const [adding, setAdding] = useState(false);
  return (
    <div className="pane filmstrip">
      <div className="pane-head">
        <span className="section-title">Shorts - {candidates.length}</span>
        <button
          type="button"
          className="head-add"
          onClick={() => setAdding(true)}
          disabled={running || adding}
          title="Add one more short"
          aria-label="Add one more short"
        >
          <Icon name="plus" />
        </button>
      </div>
      <div className="pane-scroll">
        <div className="strip">
          {candidates.map((c) => (
            <Clip
              key={c.id}
              candidate={c}
              active={c.id === selectedId}
              onSelect={() => onSelect(c.id)}
              onRemove={() => onRemove(c.id)}
            />
          ))}
        </div>
      </div>
      <AddShort
        running={running}
        step={step}
        adding={adding}
        setAdding={setAdding}
        onAddShort={onAddShort}
      />
    </div>
  );
}
