import { join } from "node:path";
import type { Project, Transcript } from "@shared/project";
import { probeVideo } from "../media/ffprobe";
import { renderShort } from "../media/render";
import { detectSilences } from "../media/silences";
import { transcribeMedia } from "../media/transcribe";
import type { ProjectService } from "./projectService";

/**
 * Injectable media runners so the agent tools and the UI IPC handlers share one
 * orchestration path, and tests can stub the heavy ffprobe/whisper/render work.
 */
export type MediaDeps = {
  probe: typeof probeVideo;
  transcribe: typeof transcribeMedia;
  render: typeof renderShort;
  detectSilences: typeof detectSilences;
};

export const realMediaDeps: MediaDeps = {
  probe: probeVideo,
  transcribe: transcribeMedia,
  render: renderShort,
  detectSilences,
};

export type ProgressSink = (chunk: string) => void;

/** Probe the source video and cache duration/dimensions/fps on the project. */
export async function probeProject(
  projects: ProjectService,
  projectId: string,
  deps: MediaDeps,
  signal?: AbortSignal,
): Promise<Project> {
  const project = await projects.get(projectId);
  const result = await deps.probe(project.source.path, { signal });
  return projects.setSourceProbe(projectId, {
    duration: result.duration,
    width: result.width,
    height: result.height,
    fps: result.fps,
  });
}

/**
 * Transcribe the source with local Whisper, store the transcript, and flip the
 * project's transcript status. Sets "running" first, "ready" on success and
 * "failed" on error, so the UI reflects progress live.
 */
export async function transcribeProject(
  projects: ProjectService,
  projectId: string,
  deps: MediaDeps,
  options: {
    model?: string;
    language?: string;
    signal?: AbortSignal;
    onProgress?: ProgressSink;
  } = {},
): Promise<Project> {
  const project = await projects.get(projectId);
  await projects.setTranscriptStatus(projectId, "running");
  try {
    const transcript = await deps.transcribe(project.source.path, {
      model: options.model,
      language: options.language,
      signal: options.signal,
      onProgress: options.onProgress,
    });
    // Detect real pauses so clip boundaries can snap to them. Best-effort: a
    // failure here must not fail the transcription that already succeeded.
    const silences = await deps
      .detectSilences(project.source.path, { signal: options.signal })
      .catch(() => []);
    await projects.saveTranscript(projectId, { ...transcript, silences });
    return await projects.setTranscriptStatus(projectId, "ready");
  } catch (error) {
    await projects.setTranscriptStatus(projectId, "failed");
    throw error;
  }
}

/**
 * Backfill detected pauses onto a transcript that predates silence detection
 * (older projects), persisting them so later renders/previews reuse the result.
 * Best-effort: detection failure leaves an empty list rather than throwing.
 */
export async function ensureSilences(
  projects: ProjectService,
  project: Project,
  transcript: Transcript,
  deps: MediaDeps,
  signal?: AbortSignal,
): Promise<Transcript> {
  if (transcript.silences) return transcript;
  const silences = await deps.detectSilences(project.source.path, { signal }).catch(() => []);
  const updated: Transcript = { ...transcript, silences };
  await projects.saveTranscript(project.id, updated);
  return updated;
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "short"
  );
}

/**
 * Render one candidate to the project's output folder and mark it rendered. The
 * candidate must be approved - rendering a proposed/rejected clip is a no-op
 * guard so the UI's approve step is meaningful.
 */
export async function renderCandidate(
  projects: ProjectService,
  projectId: string,
  candidateId: string,
  deps: MediaDeps,
  options: { signal?: AbortSignal; onProgress?: ProgressSink } = {},
): Promise<Project> {
  const project = await projects.get(projectId);
  const candidate = project.candidates.find((c) => c.id === candidateId);
  if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);
  if (candidate.status !== "approved" && candidate.status !== "rendered") {
    throw new Error("Approve the candidate before rendering it.");
  }
  let transcript = await projects.getTranscript(projectId);
  if (!transcript) throw new Error("Cannot render before transcription.");
  transcript = await ensureSilences(projects, project, transcript, deps, options.signal);

  const outputDir = projects.outputDirFor(project);
  const outputPath = join(outputDir, `${slug(candidate.title)}-${candidate.id}.mp4`);
  const workDir = join(projects.dir(projectId), ".render", candidate.id);

  await deps.render({
    sourcePath: project.source.path,
    candidate,
    words: transcript.words,
    silences: transcript.silences,
    sourceDuration: project.source.duration,
    sourceWidth: project.source.width,
    sourceHeight: project.source.height,
    outputPath,
    workDir,
    fps: project.source.fps ?? 30,
    signal: options.signal,
    onProgress: options.onProgress,
  });

  return projects.setCandidateRendered(projectId, candidateId, outputPath);
}
