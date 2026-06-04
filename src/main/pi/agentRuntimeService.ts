import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  type AgentSession,
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { AgentEvent } from "@shared/events";
import type { MediaDeps } from "../projects/projectOps";
import type { ProjectService } from "../projects/projectService";
import { chatEventsFromPiEvent, chatMessagesFromPiMessages } from "./piMessages";
import { AGENT_FILE_TOOLS, createAgentResourceLoader } from "./piResources";
import { createVideoTools, videoToolNames } from "./videoTools";

export type RuntimeAgentSession = {
  sessionId: string;
  sessionFile?: string;
  messages: unknown[];
  subscribe: (listener: (event: unknown) => void) => () => void;
  prompt: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  dispose: () => void;
  setAccessToken?: (accessToken: string) => void;
};

export type CreateAgentSessionInput = {
  projectId: string;
  cwd: string;
  sessionsDir: string;
  resumeSessionFile?: string;
  accessToken: string;
  agentDir: string;
  modelId: string;
  skillsDir?: string;
  projects: ProjectService;
  media?: MediaDeps;
};

export type SendPromptResult = {
  turnId: string;
  status: "completed" | "cancelled" | "failed";
  error?: string;
};

type AgentRuntimeOptions = {
  agentDir: string;
  modelId?: string;
  getFreshAccessToken: () => Promise<string>;
  projects: ProjectService;
  skillsDir?: string;
  media?: MediaDeps;
  createSession?: (input: CreateAgentSessionInput) => Promise<RuntimeAgentSession>;
};

type RunningTurn = { turnId: string; session?: RuntimeAgentSession; cancelled: boolean };

/**
 * One pi-coding-agent session per project, cwd'd to the project folder with the
 * file tools plus our video tools. No coordinator/worker split - a single agent
 * drives the whole shorts workflow. Streaming events are translated to the
 * renderer's AgentEvent shape.
 */
export class AgentRuntimeService {
  private readonly sessions = new Map<string, RuntimeAgentSession>();
  private readonly running = new Map<string, RunningTurn>();
  private readonly modelId: string;
  private readonly createSession: (input: CreateAgentSessionInput) => Promise<RuntimeAgentSession>;

  constructor(private readonly options: AgentRuntimeOptions) {
    this.modelId = options.modelId ?? "gpt-5.5";
    this.createSession = options.createSession ?? createRealAgentSession;
  }

  isRunning(projectId: string): boolean {
    return this.running.has(projectId);
  }

  getMessages(projectId: string) {
    return chatMessagesFromPiMessages(this.sessions.get(projectId)?.messages ?? []);
  }

  async sendPrompt(
    projectId: string,
    text: string,
    onEvent: (event: AgentEvent) => void,
  ): Promise<SendPromptResult> {
    // Reserve the project slot synchronously, before any await, so two turns
    // racing into sendPrompt can't both slip past the guard.
    if (this.running.has(projectId)) {
      throw new Error("The agent is already working on this project.");
    }
    const turnId = randomUUID();
    const running: RunningTurn = { turnId, cancelled: false };
    this.running.set(projectId, running);

    let status: SendPromptResult["status"] = "completed";
    let error: string | undefined;
    let session: RuntimeAgentSession | undefined;
    let meta = { projectId, turnId } as {
      projectId: string;
      turnId: string;
      projectTitle?: string;
    };
    let unsubscribe: (() => void) | undefined;
    try {
      const project = await this.options.projects.get(projectId);
      meta = { projectId, projectTitle: project.title, turnId };
      const accessToken = await this.options.getFreshAccessToken();
      session = await this.getOrCreateSession(projectId, accessToken);
      running.session = session;
      session.setAccessToken?.(accessToken);

      onEvent({ type: "turn_start", ...meta });
      unsubscribe = session.subscribe((event) => {
        for (const chatEvent of chatEventsFromPiEvent(event, meta)) onEvent(chatEvent);
      });

      await session.prompt(text);
      if (running.cancelled) status = "cancelled";
    } catch (caught) {
      if (running.cancelled) {
        status = "cancelled";
      } else {
        status = "failed";
        error = caught instanceof Error ? caught.message : String(caught);
      }
    } finally {
      unsubscribe?.();
      this.running.delete(projectId);
    }

    if (session) await this.options.projects.setAgentSessionFile(projectId, session.sessionFile);
    onEvent({ type: "turn_end", ...meta, status, error });
    return { turnId, status, error };
  }

  async abort(projectId: string): Promise<void> {
    const running = this.running.get(projectId);
    if (!running) return;
    running.cancelled = true;
    await running.session?.abort();
  }

  disposeProject(projectId: string): void {
    this.sessions.get(projectId)?.dispose();
    this.sessions.delete(projectId);
  }

  disposeAll(): void {
    for (const session of this.sessions.values()) session.dispose();
    this.sessions.clear();
    this.running.clear();
  }

  private async getOrCreateSession(
    projectId: string,
    accessToken: string,
  ): Promise<RuntimeAgentSession> {
    const existing = this.sessions.get(projectId);
    if (existing) return existing;
    const project = await this.options.projects.get(projectId);
    const session = await this.createSession({
      projectId,
      cwd: this.options.projects.dir(projectId),
      sessionsDir: join(this.options.projects.dir(projectId), "agent-sessions"),
      resumeSessionFile: project.agentSessionFile,
      accessToken,
      agentDir: this.options.agentDir,
      modelId: this.modelId,
      skillsDir: this.options.skillsDir,
      projects: this.options.projects,
      media: this.options.media,
    });
    this.sessions.set(projectId, session);
    return session;
  }
}

class RealAgentSessionAdapter implements RuntimeAgentSession {
  constructor(
    private readonly session: AgentSession,
    private readonly authStorage: AuthStorage,
  ) {}
  get sessionId() {
    return this.session.sessionId;
  }
  get sessionFile() {
    return this.session.sessionFile;
  }
  get messages() {
    return this.session.messages;
  }
  subscribe(listener: (event: unknown) => void) {
    return this.session.subscribe(listener);
  }
  prompt(text: string) {
    return this.session.prompt(text, { source: "rpc" });
  }
  abort() {
    return this.session.abort();
  }
  dispose() {
    this.session.dispose();
  }
  setAccessToken(accessToken: string) {
    this.authStorage.setRuntimeApiKey("openai-codex", accessToken);
  }
}

async function createRealAgentSession(
  input: CreateAgentSessionInput,
): Promise<RuntimeAgentSession> {
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey("openai-codex", input.accessToken);
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  const model = modelRegistry.find("openai-codex", input.modelId);
  if (!model) throw new Error(`Codex model not found: openai-codex/${input.modelId}`);

  const sessionManager = input.resumeSessionFile
    ? SessionManager.open(input.resumeSessionFile, input.sessionsDir, input.cwd)
    : SessionManager.create(input.cwd, input.sessionsDir);

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true },
    retry: { enabled: true, maxRetries: 2 },
    enableInstallTelemetry: false,
  });

  const resourceLoader = createAgentResourceLoader(undefined, { skillsDir: input.skillsDir });
  await resourceLoader.reload();

  const customTools = createVideoTools({
    projects: input.projects,
    projectId: input.projectId,
    media: input.media,
  });

  const { session } = await createAgentSession({
    cwd: input.cwd,
    agentDir: input.agentDir,
    authStorage,
    modelRegistry,
    model,
    thinkingLevel: "medium",
    resourceLoader,
    sessionManager,
    settingsManager,
    tools: [...AGENT_FILE_TOOLS, ...videoToolNames()],
    customTools,
  });

  return new RealAgentSessionAdapter(session, authStorage);
}
