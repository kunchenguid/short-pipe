import type { AuthStatus } from "@shared/auth";
import type { SettingsPatch, ShortPipeConfig } from "@shared/config";
import type { DependencyStatus } from "@shared/deps";
import type { AppEvent, ChatMessage } from "@shared/events";
import type { AppInfo, PickResult, ShortPipeApi, UpdateStatus } from "@shared/ipc";
import type {
  CandidatePatch,
  CreateProjectInput,
  Project,
  ProjectSummary,
  Transcript,
} from "@shared/project";
import { contextBridge, ipcRenderer } from "electron";

const api: ShortPipeApi = {
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke("sp:app:info"),
    getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke("sp:app:get-update-status"),
    openReleasePage: (): Promise<{ ok: boolean }> => ipcRenderer.invoke("sp:app:open-release-page"),
    openExternal: (url: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke("sp:app:open-external", url),
  },
  settings: {
    get: (): Promise<ShortPipeConfig> => ipcRenderer.invoke("sp:settings:get"),
    update: (patch: SettingsPatch): Promise<ShortPipeConfig> =>
      ipcRenderer.invoke("sp:settings:update", patch),
    chooseOutputDir: (): Promise<ShortPipeConfig> =>
      ipcRenderer.invoke("sp:settings:choose-output-dir"),
  },
  auth: {
    status: (): Promise<AuthStatus> => ipcRenderer.invoke("sp:auth:status"),
    login: (): Promise<AuthStatus> => ipcRenderer.invoke("sp:auth:login"),
    logout: (): Promise<void> => ipcRenderer.invoke("sp:auth:logout"),
  },
  deps: {
    check: (): Promise<DependencyStatus[]> => ipcRenderer.invoke("sp:deps:check"),
  },
  projects: {
    list: (): Promise<ProjectSummary[]> => ipcRenderer.invoke("sp:projects:list"),
    get: (projectId: string): Promise<Project> => ipcRenderer.invoke("sp:projects:get", projectId),
    create: (input: CreateProjectInput): Promise<Project> =>
      ipcRenderer.invoke("sp:projects:create", input),
    delete: (projectId: string): Promise<void> =>
      ipcRenderer.invoke("sp:projects:delete", projectId),
    pickSource: (): Promise<PickResult> => ipcRenderer.invoke("sp:projects:pick-source"),
    revealOutput: (projectId: string): Promise<void> =>
      ipcRenderer.invoke("sp:projects:reveal-output", projectId),
    probe: (projectId: string): Promise<Project> =>
      ipcRenderer.invoke("sp:projects:probe", projectId),
  },
  transcript: {
    get: (projectId: string): Promise<Transcript | null> =>
      ipcRenderer.invoke("sp:transcript:get", projectId),
    run: (projectId: string): Promise<Project> =>
      ipcRenderer.invoke("sp:transcript:run", projectId),
  },
  waveform: {
    peaks: (projectId: string, from: number, to: number, bins: number): Promise<number[]> =>
      ipcRenderer.invoke("sp:waveform:peaks", projectId, from, to, bins),
  },
  candidates: {
    patch: (projectId: string, candidateId: string, patch: CandidatePatch): Promise<Project> =>
      ipcRenderer.invoke("sp:candidates:patch", projectId, candidateId, patch),
    approve: (projectId: string, candidateId: string): Promise<Project> =>
      ipcRenderer.invoke("sp:candidates:approve", projectId, candidateId),
    reject: (projectId: string, candidateId: string): Promise<Project> =>
      ipcRenderer.invoke("sp:candidates:reject", projectId, candidateId),
    remove: (projectId: string, candidateId: string): Promise<Project> =>
      ipcRenderer.invoke("sp:candidates:remove", projectId, candidateId),
    render: (projectId: string, candidateId: string): Promise<Project> =>
      ipcRenderer.invoke("sp:candidates:render", projectId, candidateId),
  },
  agent: {
    history: (projectId: string): Promise<ChatMessage[]> =>
      ipcRenderer.invoke("sp:agent:history", projectId),
    send: (projectId: string, text: string): Promise<void> =>
      ipcRenderer.invoke("sp:agent:send", projectId, text),
    abort: (projectId: string): Promise<void> => ipcRenderer.invoke("sp:agent:abort", projectId),
    isRunning: (projectId: string): Promise<boolean> =>
      ipcRenderer.invoke("sp:agent:is-running", projectId),
  },
  events: {
    on: (listener: (event: AppEvent) => void): (() => void) => {
      const handler = (_event: unknown, payload: AppEvent) => listener(payload);
      ipcRenderer.on("sp:event", handler);
      return () => ipcRenderer.off("sp:event", handler);
    },
  },
};

contextBridge.exposeInMainWorld("shortpipe", api);
