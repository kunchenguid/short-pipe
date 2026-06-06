import type { TranscriptStatus } from "@shared/project";
import { MIN_SHORT_COUNT } from "@shared/project";
import { DurationPicker } from "./DurationPicker";
import { Icon, Spinner } from "./Icon";

/**
 * The "Let the agent find your shorts" stage state - shown in the centre pane
 * when there are no candidates to inspect yet. The agent reads the transcript on
 * the user's own Codex plan; nothing leaves the machine.
 */
export function AgentEmpty({
  status,
  running,
  step,
  count,
  onCount,
  duration,
  onDuration,
  onRun,
  onAbort,
  error,
  waitingForDuration,
}: {
  status: TranscriptStatus;
  running: boolean;
  step: string | null;
  count: number;
  onCount: (n: number) => void;
  duration: number;
  onDuration: (seconds: number) => void;
  onRun: () => void;
  onAbort: () => void;
  error: string | null;
  waitingForDuration: boolean;
}) {
  const label = status === "ready" ? "Find shorts with AI" : "Transcribe & find shorts";
  const MIN = MIN_SHORT_COUNT;
  return (
    <div className="stage-scroll">
      <div className="runner-empty">
        <div className="ic">
          <Icon name="sparkles" />
        </div>
        <h3>Let the agent find your shorts</h3>
        <p>
          It reads the transcript on your Codex plan and proposes ranked soundbites into the
          filmstrip. Nothing leaves this machine.
        </p>
        {running ? (
          <>
            <div className="runner-status">
              <Spinner /> {step ?? "Working..."}
            </div>
            <button type="button" className="btn" onClick={onAbort}>
              Stop
            </button>
          </>
        ) : (
          <>
            <div className="count-step">
              <button
                type="button"
                className="step"
                onClick={() => onCount(Math.max(MIN, count - 1))}
                disabled={count <= MIN}
                aria-label="One fewer"
              >
                <Icon name="minus" />
              </button>
              <span className="count-val">
                <strong>{count}</strong> shorts
              </span>
              <button
                type="button"
                className="step"
                onClick={() => onCount(count + 1)}
                aria-label="One more"
              >
                <Icon name="plus" />
              </button>
            </div>
            <div className="length-row">
              <span className="length-label">each about</span>
              <DurationPicker value={duration} onChange={onDuration} />
            </div>
            {waitingForDuration && (
              <div className="runner-status">Waiting for video details...</div>
            )}
            <button
              type="button"
              className="btn primary"
              onClick={onRun}
              disabled={waitingForDuration}
            >
              <Icon name="sparkles" /> {label}
            </button>
          </>
        )}
        {error && <div className="banner error">{error}</div>}
      </div>
    </div>
  );
}
