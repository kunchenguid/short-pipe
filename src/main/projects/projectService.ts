import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { ProjectEvent } from "@shared/events";
import type {
  CandidatePatch,
  CandidateProposal,
  CreateProjectInput,
  Project,
  ProjectSource,
  ProjectSummary,
  Transcript,
  TranscriptStatus,
} from "@shared/project";
import { projectSummary } from "@shared/project";
import { readJsonFile, writeJsonFile } from "../storage/json";
import { assertSafeId, projectDir, type ShortPipeLayout } from "../storage/layout";
import {
  type CandidateDefaults,
  candidateFromProposal,
  FALLBACK_CANDIDATE_DEFAULTS,
  sortByRank,
  wordTimeRange,
} from "./candidates";

const PROJECT_JSON = "project.json";
const TRANSCRIPT_JSON = "transcript.json";
const OUTPUT_DIR = "output";

export type ProjectServiceOptions = {
  layout: ShortPipeLayout;
  now?: () => Date;
  newId?: () => string;
  /** Style defaults (from Settings) used to fill agent proposals; live-read so changes apply without restart. */
  getCandidateDefaults?: () => CandidateDefaults;
  /** Global default output folder (from Settings); falls back to each project's own output/ when unset. */
  getDefaultOutputDir?: () => string | undefined;
};

/**
 * Owns every video project on disk and is the single source of truth. Both the
 * UI (via IPC) and the agent (via its tools) mutate projects through this store;
 * every mutation persists `project.json` and emits a `project_updated` event so
 * the other side re-renders.
 */
export class ProjectService {
  private readonly layout: ShortPipeLayout;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly getCandidateDefaults: () => CandidateDefaults;
  private readonly getDefaultOutputDir: () => string | undefined;
  private readonly listeners = new Set<(event: ProjectEvent) => void>();

  constructor(options: ProjectServiceOptions) {
    this.layout = options.layout;
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? (() => randomUUID().slice(0, 8));
    this.getCandidateDefaults = options.getCandidateDefaults ?? (() => FALLBACK_CANDIDATE_DEFAULTS);
    this.getDefaultOutputDir = options.getDefaultOutputDir ?? (() => undefined);
  }

  subscribe(listener: (event: ProjectEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ProjectEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  // --- paths -------------------------------------------------------------

  dir(projectId: string): string {
    return projectDir(this.layout, projectId);
  }

  projectJsonPath(projectId: string): string {
    return join(this.dir(projectId), PROJECT_JSON);
  }

  transcriptPath(projectId: string): string {
    return join(this.dir(projectId), TRANSCRIPT_JSON);
  }

  outputDirFor(project: Project): string {
    // A per-project override wins; otherwise the global default from Settings;
    // otherwise the project's own output/ folder.
    return (
      project.outputDir ?? this.getDefaultOutputDir() ?? join(this.dir(project.id), OUTPUT_DIR)
    );
  }

  // --- reads -------------------------------------------------------------

  async list(): Promise<ProjectSummary[]> {
    let entries: string[];
    try {
      entries = (await readdir(this.layout.projectsDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const projects: Project[] = [];
    for (const id of entries) {
      const project = await readJsonFile<Project>(this.projectJsonPath(id));
      if (project) projects.push(project);
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(projectSummary);
  }

  async get(projectId: string): Promise<Project> {
    assertSafeId(projectId, "project id");
    const project = await readJsonFile<Project>(this.projectJsonPath(projectId));
    if (!project) throw new Error(`Project not found: ${projectId}`);
    return project;
  }

  async getTranscript(projectId: string): Promise<Transcript | null> {
    return readJsonFile<Transcript>(this.transcriptPath(projectId));
  }

  async saveTranscript(projectId: string, transcript: Transcript): Promise<void> {
    assertSafeId(projectId, "project id");
    await writeJsonFile(this.transcriptPath(projectId), transcript);
  }

  // --- create / delete ---------------------------------------------------

  async create(input: CreateProjectInput): Promise<Project> {
    if (!input.sourcePath?.trim()) throw new Error("A source video path is required.");
    const id = this.newId();
    assertSafeId(id, "project id");
    const createdAt = this.now().toISOString();
    const title = (input.title?.trim() || titleFromPath(input.sourcePath)).slice(0, 120);
    const project: Project = {
      id,
      title,
      createdAt,
      updatedAt: createdAt,
      source: { path: input.sourcePath },
      transcriptStatus: "none",
      candidates: [],
    };
    await mkdir(this.dir(id), { recursive: true });
    await this.persist(project);
    return project;
  }

  async delete(projectId: string): Promise<void> {
    assertSafeId(projectId, "project id");
    await rm(this.dir(projectId), { recursive: true, force: true });
    this.emit({ type: "projects_listed", projects: await this.list() });
  }

  // --- mutations ---------------------------------------------------------

  /** Apply a pure transform to the stored project, persist, and emit. */
  async mutate(projectId: string, fn: (project: Project) => Project): Promise<Project> {
    const current = await this.get(projectId);
    const next = { ...fn(current), updatedAt: this.now().toISOString() };
    await this.persist(next);
    return next;
  }

  setSourceProbe(projectId: string, probe: Omit<ProjectSource, "path">): Promise<Project> {
    return this.mutate(projectId, (project) => ({
      ...project,
      source: { ...project.source, ...probe },
    }));
  }

  setTranscriptStatus(projectId: string, status: TranscriptStatus): Promise<Project> {
    return this.mutate(projectId, (project) => ({ ...project, transcriptStatus: status }));
  }

  setAgentSessionFile(projectId: string, agentSessionFile: string | undefined): Promise<Project> {
    return this.mutate(projectId, (project) => ({ ...project, agentSessionFile }));
  }

  /**
   * Replace the candidate list from a fresh batch of agent proposals, resolving
   * each word range against the transcript. Rank-sorted best-first.
   */
  async replaceCandidates(projectId: string, proposals: CandidateProposal[]): Promise<Project> {
    const transcript = await this.getTranscript(projectId);
    if (!transcript) throw new Error("Cannot propose candidates before transcription.");
    const defaults = this.getCandidateDefaults();
    const candidates = sortByRank(
      proposals.map((proposal) =>
        candidateFromProposal(proposal, transcript.words, this.newId(), defaults),
      ),
    );
    return this.mutate(projectId, (project) => ({ ...project, candidates }));
  }

  /**
   * Patch a candidate. When the word range changes (from the transcript editor),
   * the cached startTime/endTime are recomputed from the transcript so renders
   * stay consistent with the displayed trim.
   */
  async patchCandidate(
    projectId: string,
    candidateId: string,
    patch: CandidatePatch,
  ): Promise<Project> {
    let derived: { startTime?: number; endTime?: number } = {};
    if (patch.startWordId !== undefined || patch.endWordId !== undefined) {
      const [transcript, project] = await Promise.all([
        this.getTranscript(projectId),
        this.get(projectId),
      ]);
      const current = project.candidates.find((c) => c.id === candidateId);
      if (transcript && current) {
        derived = wordTimeRange(
          transcript.words,
          patch.startWordId ?? current.startWordId,
          patch.endWordId ?? current.endWordId,
        );
      }
    }
    return this.mutate(projectId, (project) => ({
      ...project,
      candidates: project.candidates.map((c) =>
        c.id === candidateId ? { ...c, ...patch, ...derived } : c,
      ),
    }));
  }

  setCandidateRendered(
    projectId: string,
    candidateId: string,
    renderedPath: string,
  ): Promise<Project> {
    return this.mutate(projectId, (project) => ({
      ...project,
      candidates: project.candidates.map((c) =>
        c.id === candidateId ? { ...c, status: "rendered", renderedPath } : c,
      ),
    }));
  }

  removeCandidate(projectId: string, candidateId: string): Promise<Project> {
    return this.mutate(projectId, (project) => ({
      ...project,
      candidates: project.candidates.filter((c) => c.id !== candidateId),
    }));
  }

  // --- internal ----------------------------------------------------------

  private async persist(project: Project): Promise<void> {
    await writeJsonFile(this.projectJsonPath(project.id), project);
    this.emit({ type: "project_updated", project });
  }
}

function titleFromPath(path: string): string {
  const name = basename(path, extname(path)).replace(/[_-]+/g, " ").trim();
  return name || "Untitled project";
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
