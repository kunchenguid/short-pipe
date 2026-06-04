import type { ProjectSummary, TranscriptStatus } from "@shared/project";
import { useCallback, useEffect, useRef, useState } from "react";
import { sp, useAppEvents } from "../api";
import { Icon, Pill } from "../components/Icon";

function statusLabel(status: TranscriptStatus): string {
  if (status === "ready") return "transcribed";
  if (status === "running") return "transcribing";
  if (status === "none") return "not transcribed";
  return status;
}

function ProjectTile({ p, onOpen }: { p: ProjectSummary; onOpen: (id: string) => void }) {
  // Show a real frame from the source as the poster, streamed via sp-media://.
  // Falls back to the neutral placeholder for codecs Chromium can't decode.
  const [noPoster, setNoPoster] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  function seekToPosterFrame() {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration;
    // a representative frame a little into the clip (avoids the first black/fade frame)
    v.currentTime = Number.isFinite(d) && d > 0 ? Math.max(0.5, Math.min(d * 0.1, 10)) : 0.5;
  }

  return (
    <button type="button" className="card project-tile" onClick={() => onOpen(p.id)}>
      <div className={`tile-poster${noPoster ? " no-video" : ""}`}>
        {!noPoster && (
          <video
            ref={videoRef}
            className="tile-vid"
            src={`sp-media://video/${p.id}`}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={seekToPosterFrame}
            onError={() => setNoPoster(true)}
          />
        )}
        <span className="play-overlay">
          <Icon name="play" />
        </span>
      </div>
      <div className="tile-body">
        <h3>{p.title}</h3>
        <div className="tile-meta">
          <Pill status={p.transcriptStatus === "none" ? "none" : p.transcriptStatus}>
            {statusLabel(p.transcriptStatus)}
          </Pill>
          <span>
            {p.candidateCount} {p.candidateCount === 1 ? "short" : "shorts"}
          </span>
        </div>
        <div className="tile-path">{p.sourcePath}</div>
      </div>
    </button>
  );
}

export function Home({ onOpen }: { onOpen: (projectId: string) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    sp.projects
      .list()
      .then(setProjects)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(refresh, [refresh]);
  useAppEvents(
    useCallback(
      (event) => {
        if (event.type === "projects_listed") setProjects(event.projects);
        if (event.type === "project_updated") refresh();
      },
      [refresh],
    ),
  );

  async function newProject() {
    setError(null);
    const pick = await sp.projects.pickSource();
    if (pick.canceled || !pick.path) return;
    setBusy(true);
    try {
      const project = await sp.projects.create({ sourcePath: pick.path });
      onOpen(project.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="library">
      <div className="library-head">
        <h2>Your projects</h2>
        <button type="button" className="btn primary" onClick={newProject} disabled={busy}>
          <Icon name="plus" /> New project from video
        </button>
      </div>
      {error && <div className="banner error">{error}</div>}
      <div className="project-grid">
        <button type="button" className="dropzone" onClick={newProject} disabled={busy}>
          <Icon name="upload" />
          <div className="dz-title">{busy ? "Opening..." : "Drop a long-form video"}</div>
          <div className="dz-sub">It stays on your disk. Nothing uploads.</div>
        </button>
        {projects.map((p) => (
          <ProjectTile key={p.id} p={p} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
