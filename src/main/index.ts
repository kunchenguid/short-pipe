import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DEFAULT_CODEX_MODEL,
  normalizeShortPipeConfig,
  type SettingsPatch,
  type ShortPipeConfig,
} from "@shared/config";
import type { AppEvent } from "@shared/events";
import type { AppInfo, PickResult, Platform } from "@shared/ipc";
import type { CandidatePatch, CreateProjectInput } from "@shared/project";
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron";
import { CodexAuthService, createCodexTokenCodec } from "./auth/codexAuth";
import { checkDependencies } from "./deps/dependencies";
import { registerMediaProtocol, registerMediaScheme } from "./media/mediaProtocol";
import { AgentRuntimeService } from "./pi/agentRuntimeService";
import {
  probeProject,
  realMediaDeps,
  renderCandidate,
  transcribeProject,
} from "./projects/projectOps";
import { ProjectService } from "./projects/projectService";
import { SettingsService } from "./settings/settingsService";
import { readJsonFile } from "./storage/json";
import { bootstrapLayout, resolveShortPipeRoot, type ShortPipeLayout } from "./storage/layout";
import { getDefaultTelemetry, initDefaultTelemetry } from "./telemetry";
import { createUpdateChecker } from "./update-checker";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

const isolatedUserDataDir =
  !app.isPackaged && process.env.SHORT_PIPE_USER_DATA_DIR?.trim()
    ? process.env.SHORT_PIPE_USER_DATA_DIR.trim()
    : null;

type Services = {
  layout: ShortPipeLayout;
  auth: CodexAuthService;
  settings: SettingsService;
  projects: ProjectService;
  agent: AgentRuntimeService;
};

function shortPipeRootFor(): string {
  return resolveShortPipeRoot(homedir(), isolatedUserDataDir);
}

// The sp-media:// scheme (project footage + live previews) must be declared
// privileged before app.ready.
registerMediaScheme();

/** Vendored gsap, inlined into preview docs so the live preview stays offline. */
async function loadGsapSource(): Promise<string> {
  try {
    const resolve = createRequire(import.meta.url).resolve;
    return await readFile(resolve("gsap/dist/gsap.min.js"), "utf8");
  } catch {
    return "";
  }
}

/** Bundled skills (shorts-from-longform, hyperframes). Packaged into resourcesPath/skills. */
function skillsDirFor(): string {
  return app.isPackaged ? join(process.resourcesPath, "skills") : join(__dirname, "../../skills");
}

const VIDEO_EXTENSIONS = ["mp4", "mov", "mkv", "webm", "m4v", "avi"];

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: "#faf9f5",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Live preview drives <video> playback via postMessage, not a click inside
      // the frame, so it must not require a per-frame user gesture.
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  win.once("ready-to-show", () => win.show());
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (isDev && devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return win;
}

function modelIdFromConfig(value: string): string {
  const prefix = "openai-codex/";
  if (value.startsWith(prefix)) return value.slice(prefix.length);
  if (value.trim()) return value.trim();
  return DEFAULT_CODEX_MODEL.slice(prefix.length);
}

async function createServices(layout: ShortPipeLayout): Promise<Services> {
  const config = normalizeShortPipeConfig(await readJsonFile<ShortPipeConfig>(layout.configPath));
  const settings = new SettingsService({ configPath: layout.configPath, initial: config });
  const auth = new CodexAuthService({
    authPath: layout.codexAuthPath,
    codec: createCodexTokenCodec(safeStorage),
    openExternal: (url) => shell.openExternal(url),
  });
  const projects = new ProjectService({
    layout,
    getCandidateDefaults: () => {
      const c = settings.get();
      return {
        layout: c.defaultLayout,
        captionStyle: c.defaultCaptionStyle,
        theme: c.defaultTheme,
      };
    },
    getDefaultOutputDir: () => settings.get().defaultOutputDir,
  });
  const agent = new AgentRuntimeService({
    agentDir: layout.piAgentDir,
    modelId: modelIdFromConfig(config.defaultModel),
    getFreshAccessToken: () => auth.getFreshAccessToken(),
    projects,
    skillsDir: skillsDirFor(),
    media: realMediaDeps,
  });
  return { layout, auth, settings, projects, agent };
}

function broadcast(event: AppEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send("sp:event", event);
    }
  }
}

export function registerIpc(services: Services): void {
  const { projects, agent, auth, settings } = services;

  ipcMain.handle(
    "sp:app:info",
    (): AppInfo => ({
      version: app.getVersion(),
      platform: process.platform as Platform,
      userDataDir: app.getPath("userData"),
      shortPipeDir: services.layout.root,
    }),
  );

  // In-app update check. The renderer reads the cached status to show an
  // "update available" indicator; there is no auto-updater, so opening the
  // release page (where the `brew upgrade` instructions live) is the action.
  // Dev/source builds are never behind a release, so force the indicator on
  // there to keep it visible while developing; packaged builds do the real check.
  const updateChecker = createUpdateChecker({
    currentVersion: app.getVersion(),
    openExternal: (url) => shell.openExternal(url),
    simulateUpdate: !app.isPackaged,
  });
  ipcMain.handle("sp:app:get-update-status", () => updateChecker.getStatus());
  ipcMain.handle("sp:app:open-release-page", async () => {
    await updateChecker.openReleasePage();
    return { ok: true };
  });
  // Opens an http(s) setup/docs link in the user's browser. Scheme-restricted so
  // a renderer can never coax the main process into opening a file:// or custom
  // protocol URL.
  ipcMain.handle("sp:app:open-external", async (_e, url: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`Refusing to open non-web URL: ${parsed.protocol}`);
    }
    await shell.openExternal(parsed.toString());
    return { ok: true };
  });

  // Probe the external CLI tools (ffmpeg/ffprobe/hyperframes) the pipeline shells
  // out to, so the startup checklist can show what is ready and how to install
  // the rest before any project runs.
  ipcMain.handle("sp:deps:check", () => checkDependencies());

  ipcMain.handle("sp:settings:get", () => settings.get());
  ipcMain.handle("sp:settings:update", (_e, patch: SettingsPatch) => settings.update(patch));
  ipcMain.handle("sp:settings:choose-output-dir", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose a default output folder for shorts",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return settings.get();
    return settings.update({ defaultOutputDir: result.filePaths[0] });
  });

  ipcMain.handle("sp:auth:status", () => auth.status());
  ipcMain.handle("sp:auth:login", () => auth.login());
  ipcMain.handle("sp:auth:logout", async () => {
    await auth.logout();
    agent.disposeAll();
  });

  ipcMain.handle("sp:projects:list", () => projects.list());
  ipcMain.handle("sp:projects:get", (_e, projectId: string) => projects.get(projectId));
  ipcMain.handle("sp:projects:create", (_e, input: CreateProjectInput) => projects.create(input));
  ipcMain.handle("sp:projects:delete", async (_e, projectId: string) => {
    agent.disposeProject(projectId);
    await projects.delete(projectId);
  });
  ipcMain.handle("sp:projects:pick-source", async (): Promise<PickResult> => {
    const result = await dialog.showOpenDialog({
      title: "Choose a long-form video",
      properties: ["openFile"],
      filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });
  ipcMain.handle("sp:projects:reveal-output", async (_e, projectId: string) => {
    const project = await projects.get(projectId);
    const dir = projects.outputDirFor(project);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    const failure = await shell.openPath(dir);
    if (failure) throw new Error(failure);
  });

  ipcMain.handle("sp:transcript:get", (_e, projectId: string) => projects.getTranscript(projectId));
  ipcMain.handle("sp:transcript:run", (_e, projectId: string) => {
    getDefaultTelemetry().track("transcribe");
    return transcribeProject(projects, projectId, realMediaDeps);
  });

  ipcMain.handle(
    "sp:waveform:peaks",
    (_e, projectId: string, from: number, to: number, bins: number) =>
      projects.getWaveformPeaks(projectId, from, to, bins),
  );

  ipcMain.handle(
    "sp:candidates:patch",
    (_e, projectId: string, candidateId: string, patch: CandidatePatch) =>
      projects.patchCandidate(projectId, candidateId, patch),
  );
  ipcMain.handle("sp:candidates:approve", (_e, projectId: string, candidateId: string) =>
    projects.patchCandidate(projectId, candidateId, { status: "approved" }),
  );
  ipcMain.handle("sp:candidates:reject", (_e, projectId: string, candidateId: string) =>
    projects.patchCandidate(projectId, candidateId, { status: "rejected" }),
  );
  ipcMain.handle("sp:candidates:remove", (_e, projectId: string, candidateId: string) =>
    projects.removeCandidate(projectId, candidateId),
  );
  ipcMain.handle("sp:candidates:render", (_e, projectId: string, candidateId: string) => {
    getDefaultTelemetry().track("render");
    return renderCandidate(projects, projectId, candidateId, realMediaDeps);
  });

  ipcMain.handle("sp:agent:history", (_e, projectId: string) => agent.getMessages(projectId));
  ipcMain.handle("sp:agent:is-running", (_e, projectId: string) => agent.isRunning(projectId));
  ipcMain.handle("sp:agent:send", (_e, projectId: string, text: string) =>
    agent.sendPrompt(projectId, text, broadcast).then(() => undefined),
  );
  ipcMain.handle("sp:agent:abort", (_e, projectId: string) => agent.abort(projectId));

  // Probe lazily on demand (used by the UI when opening a project without dims).
  ipcMain.handle("sp:projects:probe", (_e, projectId: string) =>
    probeProject(projects, projectId, realMediaDeps),
  );
}

/**
 * Headless agent end-to-end check (SP_AGENT_E2E=1). Uses the real, signed-in
 * Codex token and the real media tools to drive one full agent turn against a
 * test video, then verifies the agent transcribed and proposed candidates.
 * Optionally approves the top candidate and renders it (SP_AGENT_E2E_RENDER=1).
 * Cleans up its own project. Never runs in normal use.
 */
async function runAgentE2E(services: Services): Promise<void> {
  const status = await services.auth.status();
  if (!status.authenticated) {
    console.log("SP_AGENT_E2E_FAIL not signed in to Codex");
    return;
  }
  const source = process.env.SP_AGENT_E2E_SOURCE ?? "/tmp/sp-asset/source.mp4";
  const { projects, agent } = services;
  const project = await projects.create({ sourcePath: source, title: "E2E agent check" });
  console.log(`[e2e] project ${project.id} from ${source}`);

  const onEvent = (event: AppEvent) => {
    if (event.type === "tool_start") console.log(`[e2e] tool start: ${event.toolName}`);
    else if (event.type === "tool_end")
      console.log(`[e2e] tool end${event.isError ? " ERROR" : ""}`);
    else if (event.type === "assistant_delta") process.stdout.write(event.text);
    else if (event.type === "turn_end")
      console.log(`\n[e2e] turn ${event.status} ${event.error ?? ""}`);
  };

  const prompt =
    "Transcribe this video with the small.en Whisper model, then read transcript.json and propose the 2 best shorts via propose_candidates. Be quick and do not render anything.";
  const result = await agent.sendPrompt(project.id, prompt, onEvent);

  const final = await projects.get(project.id);
  console.log(`[e2e] transcript=${final.transcriptStatus} candidates=${final.candidates.length}`);
  for (const c of final.candidates) {
    console.log(
      `[e2e]  #${c.rank} "${c.title}" ${c.startWordId}..${c.endWordId} ${c.layout}/${c.captionStyle} kw=[${c.keywords.join(",")}]`,
    );
  }

  let renderInfo = "skipped";
  if (process.env.SP_AGENT_E2E_RENDER === "1" && final.candidates.length > 0) {
    const top = final.candidates[0];
    await projects.patchCandidate(project.id, top.id, { status: "approved" });
    const rendered = await renderCandidate(projects, project.id, top.id, realMediaDeps);
    const path = rendered.candidates.find((c) => c.id === top.id)?.renderedPath;
    if (path) {
      const probe = await realMediaDeps.probe(path);
      renderInfo = `${path} (${probe.width}x${probe.height}, ${probe.duration?.toFixed(1)}s)`;
    } else {
      renderInfo = "none";
    }
    console.log(`[e2e] rendered: ${renderInfo}`);
  }

  if (process.env.SP_AGENT_E2E_KEEP !== "1") await projects.delete(project.id);
  else console.log(`[e2e] kept project ${project.id} at ${projects.dir(project.id)}`);
  const ok =
    result.status === "completed" &&
    final.transcriptStatus === "ready" &&
    final.candidates.length > 0;
  console.log(
    `${ok ? "SP_AGENT_E2E_OK" : "SP_AGENT_E2E_FAIL"} turn=${result.status} transcript=${final.transcriptStatus} candidates=${final.candidates.length} render=${renderInfo}`,
  );
}

void app.whenReady().then(async () => {
  const layout = await bootstrapLayout(shortPipeRootFor());
  const services = await createServices(layout);

  if (process.env.SP_AGENT_E2E === "1") {
    try {
      await runAgentE2E(services);
    } catch (error) {
      console.log(`SP_AGENT_E2E_FAIL ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      services.agent.disposeAll();
      app.quit();
    }
    return;
  }

  // Anonymous, best-effort usage telemetry. No-op unless a build-time Umami
  // website id was injected (packaged release builds only); see ./telemetry.
  const telemetry = initDefaultTelemetry({
    app: "short-pipe",
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
  });
  telemetry.track("app_start");
  telemetry.pageview("/launch");

  services.projects.subscribe(broadcast);
  registerIpc(services);
  registerMediaProtocol({
    getProject: (id) => services.projects.get(id),
    getTranscript: (id) => services.projects.getTranscript(id),
    gsapSource: await loadGsapSource(),
  });
  const win = createMainWindow();

  // Headless boot check (CI/e2e): once the renderer loads, confirm the preload
  // bridge and React root are present, print a sentinel, and quit. Never runs
  // in normal use.
  if (process.env.SP_SMOKE === "1") {
    win.webContents.on("did-finish-load", () => {
      void (async () => {
        try {
          const ready = await win.webContents.executeJavaScript(
            "Boolean(window.shortpipe && window.shortpipe.projects && document.getElementById('root'))",
          );
          const status = await services.auth.status();
          console.log(`SP_SMOKE_OK bridge=${ready} authed=${status.authenticated}`);
        } catch (error) {
          console.log(`SP_SMOKE_FAIL ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          app.quit();
        }
      })();
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
  app.once("before-quit", () => {
    services.agent.disposeAll();
    void telemetry.close(500);
  });
});

app.on("window-all-closed", () => {
  if (isDev || process.platform !== "darwin") app.quit();
});

export function isAppRendererSource(
  value: string | undefined,
  bundledRendererFile = join(__dirname, "../renderer/index.html"),
): boolean {
  if (!value) return false;
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  try {
    const url = new URL(value);
    if (devServerUrl && url.origin === new URL(devServerUrl).origin) return true;
    return url.protocol === "file:" && url.href === pathToFileURL(bundledRendererFile).href;
  } catch {
    return false;
  }
}
