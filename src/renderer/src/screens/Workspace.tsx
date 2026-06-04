import type { AppEvent } from "@shared/events";
import type { Project, Transcript } from "@shared/project";
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
  const [count, setCount] = useState(3);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  useEffect(() => {
    sp.projects
      .get(projectId)
      .then(setProject)
      .catch((e) => setError(String(e)));
    sp.transcript
      .get(projectId)
      .then(setTranscript)
      .catch(() => {});
    sp.projects
      .probe(projectId)
      .then(setProject)
      .catch(() => {});
    sp.agent.isRunning(projectId).then(setRunning);
  }, [projectId]);

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
          onClick={() => void run(() => sp.projects.chooseOutputDir(projectId).then(setProject))}
        >
          <Icon name="folderOpen" /> Output folder
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => void run(() => sp.projects.revealOutput(projectId))}
        >
          Reveal
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
          onFind={findShorts}
          canFind={!running}
        />

        <div className="pane stage">
          {trimming ? (
            <TranscriptEditor
              projectId={projectId}
              transcript={transcript}
              candidate={selected}
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
              onCount={setCount}
              onRun={findShorts}
              onAbort={() => void sp.agent.abort(projectId)}
              error={error}
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
