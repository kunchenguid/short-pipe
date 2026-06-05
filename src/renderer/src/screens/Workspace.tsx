import type { AppEvent } from "@shared/events";
import type { Project, Transcript } from "@shared/project";
import { defaultShortCount } from "@shared/project";
import { useCallback, useEffect, useState } from "react";
import { formatTime, sp, useAppEvents } from "../api";
import { AgentEmpty } from "../components/AgentEmpty";
import { Filmstrip } from "../components/Filmstrip";
import { Icon, Pill } from "../components/Icon";
import { Inspector } from "../components/Inspector";
import { StagePreview } from "../components/StagePreview";
import { TranscriptEditor } from "../components/TranscriptEditor";

const STEP_LABELS: Record<string, string> = {
  probe: "Reading the video",
  transcribe: "Transcribing (local Whisper)",
  read: "Reading the transcript",
  find: "Scanning the transcript",
  grep: "Scanning the transcript",
  ls: "Looking through the project",
  propose_candidates: "Choosing the best shorts",
  render_short: "Rendering",
  compact_context: "Thinking",
  retry: "Retrying",
};

export function Workspace({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"review" | "trim">("review");
  const [error, setError] = useState<string | null>(null);

  // Agent run state (driven by streaming tool events).
  const [count, setCount] = useState(defaultShortCount());
  const [countTouched, setCountTouched] = useState(false);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [probingDuration, setProbingDuration] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setProbingDuration(true);
    sp.projects
      .get(projectId)
      .then((p) => {
        setProject(p);
        if (p.source.duration) setProbingDuration(false);
      })
      .catch((e) => setError(String(e)));
    sp.transcript
      .get(projectId)
      .then(setTranscript)
      .catch(() => {});
    sp.projects
      .probe(projectId)
      .then((p) => {
        if (!cancelled) setProject(p);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setProbingDuration(false);
      });
    sp.agent.isRunning(projectId).then(setRunning);
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Default the requested count to one short per minute of source video, until the
  // user nudges it themselves. The duration arrives async from probe(), so this
  // reacts to it rather than seeding useState (which runs before the project loads).
  useEffect(() => {
    if (countTouched) return;
    const duration = project?.source.duration;
    if (!duration) return;
    setCount(defaultShortCount(duration));
  }, [project?.source.duration, countTouched]);

  const onCount = useCallback((n: number) => {
    setCountTouched(true);
    setCount(n);
  }, []);

  // Default the selection to the first candidate; keep it valid as the queue changes.
  useEffect(() => {
    if (!project) return;
    const ids = project.candidates.map((c) => c.id);
    if (ids.length === 0) {
      if (selectedId !== null) setSelectedId(null);
    } else if (!selectedId || !ids.includes(selectedId)) {
      setSelectedId(ids[0]);
    }
  }, [project, selectedId]);

  const onEvent = useCallback(
    (event: AppEvent) => {
      if (event.type === "project_updated" && event.project.id === projectId) {
        setProject(event.project);
        if (event.project.transcriptStatus === "ready") {
          sp.transcript
            .get(projectId)
            .then(setTranscript)
            .catch(() => {});
        }
        return;
      }
      if (!("projectId" in event) || event.projectId !== projectId) return;
      if (event.type === "turn_start") {
        setRunning(true);
        setStep("Starting");
      } else if (event.type === "tool_start") {
        setStep(STEP_LABELS[event.toolName] ?? event.toolName);
      } else if (event.type === "turn_end") {
        setRunning(false);
        setStep(null);
        if (event.status === "failed") setError(event.error ?? "The agent run failed.");
      }
    },
    [projectId],
  );
  useAppEvents(onEvent);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function findShorts() {
    setError(null);
    setMode("review");
    setRunning(true);
    setStep("Starting");
    try {
      await sp.agent.send(
        projectId,
        `Transcribe the video if it is not already transcribed, then read the transcript and propose the ${count} best shorts using propose_candidates. Do not render anything.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRunning(false);
      setStep(null);
    }
  }

  // Ask the agent for exactly one more short, guided by the user's prompt. The
  // agent works one prompt at a time, so the filmstrip footer disables itself
  // while `running` is true.
  async function findOneMore(prompt: string) {
    setError(null);
    setRunning(true);
    setStep("Starting");
    try {
      await sp.agent.send(
        projectId,
        `Find one more short for this project, guided by what the user is looking for: "${prompt}". Read the transcript and add exactly one additional short using the add_candidates tool (never propose_candidates, which would wipe the existing queue). Do not duplicate any short already in the filmstrip, and do not render anything.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRunning(false);
      setStep(null);
    }
  }

  if (!project) {
    return (
      <div className="center-screen">
        {error ? <div className="banner error">{error}</div> : <span className="spinner" />}
      </div>
    );
  }

  const s = project.source;
  const ready = project.transcriptStatus === "ready";
  const selected = project.candidates.find((c) => c.id === selectedId) ?? null;
  const waitingForDuration = !project.source.duration && probingDuration;
  const specs = `${s.width && s.height ? `${s.width}x${s.height}` : "size unknown"} · ${
    s.fps ? `${s.fps}fps` : "fps ?"
  } · ${formatTime(s.duration)}`;
  const trimming = mode === "trim" && selected && transcript;

  return (
    <div
      className="work-main"
      style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      <div className="work-bar">
        <button type="button" className="btn small ghost" onClick={onBack}>
          <Icon name="chevronLeft" /> Projects
        </button>
        <span className="file" style={{ marginLeft: 8 }}>
          <Icon name="fileVideo" style={{ color: "var(--ink-3)" }} />
          <span className="name">{project.title}</span>
        </span>
        <Pill status={project.transcriptStatus}>{project.transcriptStatus}</Pill>
        <span className="specs">{specs}</span>
        <span className="spacer" />
        {!ready && (
          <button
            type="button"
            className="btn small"
            disabled={running}
            onClick={() => void run(() => sp.transcript.run(projectId))}
          >
            {project.transcriptStatus === "running" ? "Transcribing..." : "Transcribe"}
          </button>
        )}
        <button
          type="button"
          className="btn small"
          onClick={() => void run(() => sp.projects.revealOutput(projectId))}
        >
          <Icon name="folderOpen" /> Open output folder
        </button>
      </div>

      {error && (
        <div style={{ padding: "8px 20px 0" }}>
          <div className="banner error">{error}</div>
        </div>
      )}

      <div className="editor">
        <Filmstrip
          candidates={project.candidates}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setMode("review");
          }}
          onRemove={(id) => void run(() => sp.candidates.remove(projectId, id))}
          onAddShort={findOneMore}
          running={running}
          step={step}
        />

        <div className="pane stage">
          {trimming ? (
            <TranscriptEditor
              projectId={projectId}
              transcript={transcript}
              candidate={selected}
              sourceDuration={project.source.duration}
              onClose={() => setMode("review")}
            />
          ) : selected ? (
            <StagePreview projectId={projectId} candidate={selected} />
          ) : (
            <AgentEmpty
              status={project.transcriptStatus}
              running={running}
              step={step}
              count={count}
              onCount={onCount}
              onRun={findShorts}
              onAbort={() => void sp.agent.abort(projectId)}
              error={error}
              waitingForDuration={waitingForDuration}
            />
          )}
        </div>

        {selected && mode !== "trim" ? (
          <Inspector
            key={selected.id}
            projectId={projectId}
            candidate={selected}
            transcript={transcript}
            onTrim={() => setMode("trim")}
          />
        ) : (
          <div className="pane inspector">
            <div className="pane-head">
              <span className="section-title">Inspector</span>
            </div>
            <div className="insp">
              <p className="muted" style={{ fontSize: 13 }}>
                {mode === "trim"
                  ? "Trimming..."
                  : "Run the agent to propose shorts, then select one to inspect."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
