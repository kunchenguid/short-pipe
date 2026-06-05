import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { ProjectEvent } from "@shared/events";
import type {
  Candidate,
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
import { extractPeaks } from "../media/waveform";
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
const MAX_WAVEFORM_BINS = 20_000;
const MAX_WAVEFORM_WINDOW_SEC = 120;

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
    return this.getDefaultOutputDir() ?? join(this.dir(project.id), OUTPUT_DIR);
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

  /**
   * Waveform peaks for the source's [from, to] window, `bins` bars normalized to
   * 0..1. The waveform trimmer requests only the slice it is showing, so a long
   * source stays cheap (one short ffmpeg pass per visible window).
   */
  async getWaveformPeaks(
    projectId: string,
    from: number,
    to: number,
    bins: number,
  ): Promise<number[]> {
    const project = await this.get(projectId);
    if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(bins) || bins <= 0) {
      throw new Error("Invalid waveform request");
    }
    const safeFrom = Math.max(0, from);
    const sourceEnd =
      Number.isFinite(project.source.duration) && project.source.duration !== undefined
        ? Math.max(0, project.source.duration)
        : Number.POSITIVE_INFINITY;
    const safeTo = Math.min(Math.max(0, to), sourceEnd, safeFrom + MAX_WAVEFORM_WINDOW_SEC);
    if (safeTo <= safeFrom) throw new Error("Invalid waveform request");
    return extractPeaks(project.source.path, {
      from: safeFrom,
      to: safeTo,
      bins: Math.min(Math.floor(bins), MAX_WAVEFORM_BINS),
    });
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

  /** Resolve a batch of agent proposals into candidates against the transcript. */
  private async resolveProposals(
    projectId: string,
    proposals: CandidateProposal[],
  ): Promise<Candidate[]> {
    const transcript = await this.getTranscript(projectId);
    if (!transcript) throw new Error("Cannot propose candidates before transcription.");
    const defaults = this.getCandidateDefaults();
    return proposals.map((proposal) =>
      candidateFromProposal(proposal, transcript.words, this.newId(), defaults),
    );
  }

  /**
   * Replace the candidate list from a fresh batch of agent proposals, resolving
   * each word range against the transcript. Rank-sorted best-first. This is the
   * clean-slate bulk operation behind the initial "find shorts" run.
   */
  async replaceCandidates(projectId: string, proposals: CandidateProposal[]): Promise<Project> {
    const candidates = sortByRank(await this.resolveProposals(projectId, proposals));
    return this.mutate(projectId, (project) => ({ ...project, candidates }));
  }

  /**
   * Add fresh proposals onto the existing queue without dropping any prior
   * candidates, re-sorting the merged list by rank. This backs the incremental
   * "add one more short" flow, where the user keeps everything they already have.
   */
  async appendCandidates(projectId: string, proposals: CandidateProposal[]): Promise<Project> {
    const added = await this.resolveProposals(projectId, proposals);
    return this.mutate(projectId, (project) => ({
      ...project,
      candidates: sortByRank([...project.candidates, ...added]),
    }));
  }

  /**
   * Patch a candidate. When the word range changes (from the transcript editor),
   * the cached startTime/endTime are recomputed from the transcript so renders
   * stay consistent with the displayed trim, and any manual waveform cut override
   * is cleared - re-selecting words is the explicit "start over" gesture, so the
   * clip drops back to silence-snapping unless the same patch sets a new override.
   */
  async patchCandidate(
    projectId: string,
    candidateId: string,
    patch: CandidatePatch,
  ): Promise<Project> {
    let derived: {
      startTime?: number;
      endTime?: number;
      cutStart?: number;
      cutEnd?: number;
    } = {};
    if (patch.startWordId !== undefined || patch.endWordId !== undefined) {
      const [transcript, project] = await Promise.all([
        this.getTranscript(projectId),
        this.get(projectId),
      ]);
      const current = project.candidates.find((c) => c.id === candidateId);
      if (transcript && current) {
        derived = {
          ...wordTimeRange(
            transcript.words,
            patch.startWordId ?? current.startWordId,
            patch.endWordId ?? current.endWordId,
          ),
          // Default the override to cleared, but let this same patch set a fresh
          // one (the editor saves the word range and the waveform cut together).
          cutStart: patch.cutStart,
          cutEnd: patch.cutEnd,
        };
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
