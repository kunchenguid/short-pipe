import type { Candidate } from "@shared/project";
import { formatTime } from "../api";
import { Icon, Pill } from "./Icon";

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

export function Filmstrip({
  candidates,
  selectedId,
  onSelect,
  onRemove,
}: {
  candidates: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="pane filmstrip">
      <div className="pane-head">
        <span className="section-title">Shorts - {candidates.length}</span>
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
    </div>
  );
}
