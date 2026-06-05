import type { AuthStatus } from "./auth";
import type { SettingsPatch, ShortPipeConfig } from "./config";
import type { AppEvent, ChatMessage } from "./events";
import type {
  CandidatePatch,
  CreateProjectInput,
  Project,
  ProjectSummary,
  Transcript,
} from "./project";

export type Platform = "darwin" | "win32" | "linux" | (string & {});

export type AppInfo = {
  version: string;
  platform: Platform;
  userDataDir: string;
  shortPipeDir: string;
};

/** Result of asking the OS for a video file via the native open dialog. */
export type PickResult = { canceled: boolean; path?: string };

/**
 * Snapshot of the in-app update check. Short Pipe ships through GitHub Releases
 * and the Homebrew cask built from them, so this only reports whether a newer
 * release exists; there is no in-app auto-updater.
 */
export type UpdateStatus = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
};

/**
 * The typed bridge exposed to the renderer as `window.shortpipe`. Every method
 * is a namespaced `ipcRenderer.invoke` request/response, except `events.on`,
 * which subscribes to the single one-way `sp:event` channel.
 */
export type ShortPipeApi = {
  app: {
    info: () => Promise<AppInfo>;
    /** Cached result of the background GitHub-releases update check. */
    getUpdateStatus: () => Promise<UpdateStatus>;
    /** Opens the latest release page in the user's browser. */
    openReleasePage: () => Promise<{ ok: boolean }>;
  };
  settings: {
    /** Current app-global config (model + style/output defaults). */
    get: () => Promise<ShortPipeConfig>;
    /** Patch one or more default fields and persist; resolves with the new config. */
    update: (patch: SettingsPatch) => Promise<ShortPipeConfig>;
    /** Opens a directory picker to set the global default output folder. */
    chooseOutputDir: () => Promise<ShortPipeConfig>;
  };
  auth: {
    status: () => Promise<AuthStatus>;
    login: () => Promise<AuthStatus>;
    logout: () => Promise<void>;
  };
  projects: {
    list: () => Promise<ProjectSummary[]>;
    get: (projectId: string) => Promise<Project>;
    create: (input: CreateProjectInput) => Promise<Project>;
    delete: (projectId: string) => Promise<void>;
    /** Opens the native file picker for a source video. */
    pickSource: () => Promise<PickResult>;
    /** Reveals the project's effective output folder in the OS file manager. */
    revealOutput: (projectId: string) => Promise<void>;
    /** Probe the source video for duration/dimensions/fps. */
    probe: (projectId: string) => Promise<Project>;
  };
  transcript: {
    get: (projectId: string) => Promise<Transcript | null>;
    /** Kicks off local-Whisper transcription; resolves when it finishes. */
    run: (projectId: string) => Promise<Project>;
  };
  candidates: {
    patch: (projectId: string, candidateId: string, patch: CandidatePatch) => Promise<Project>;
    approve: (projectId: string, candidateId: string) => Promise<Project>;
    reject: (projectId: string, candidateId: string) => Promise<Project>;
    remove: (projectId: string, candidateId: string) => Promise<Project>;
    render: (projectId: string, candidateId: string) => Promise<Project>;
  };
  agent: {
    history: (projectId: string) => Promise<ChatMessage[]>;
    send: (projectId: string, text: string) => Promise<void>;
    abort: (projectId: string) => Promise<void>;
    isRunning: (projectId: string) => Promise<boolean>;
  };
  events: {
    on: (listener: (event: AppEvent) => void) => () => void;
  };
};

declare global {
  interface Window {
    shortpipe: ShortPipeApi;
  }
}
