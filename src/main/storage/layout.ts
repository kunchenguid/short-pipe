import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { normalizeShortPipeConfig, type ShortPipeConfig } from "@shared/config";
import { readJsonFile, writeJsonFile } from "./json";

/**
 * On-disk layout under `~/.short-pipe/`. Holds config, Codex auth, the
 * pi agent's working dir, and one folder per video project (each with its own
 * `output/`). A single visible home keeps all persistent state in one place
 * instead of buried under the OS app-data directory.
 */
export type ShortPipeLayout = {
  root: string;
  configPath: string;
  authDir: string;
  codexAuthPath: string;
  piAgentDir: string;
  projectsDir: string;
};

/**
 * Resolve the Short Pipe data root. By default everything lives in
 * `~/.short-pipe/`. A dev instance can relocate it by setting an isolated data
 * dir (env-driven), which gets its own `short-pipe/` subfolder so parallel
 * instances never collide.
 */
export function resolveShortPipeRoot(homeDir: string, isolatedUserDataDir?: string | null): string {
  const isolated = isolatedUserDataDir?.trim();
  if (isolated) return join(isolated, "short-pipe");
  return join(homeDir, ".short-pipe");
}

export function buildLayout(root: string): ShortPipeLayout {
  return {
    root,
    configPath: join(root, "config.json"),
    authDir: join(root, "auth"),
    codexAuthPath: join(root, "auth", "codex.json"),
    piAgentDir: join(root, "pi-agent"),
    projectsDir: join(root, "projects"),
  };
}

export function assertSafeId(id: string, label = "id"): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid ${label}`);
  }
  return id;
}

export function projectDir(layout: ShortPipeLayout, projectId: string): string {
  return join(layout.projectsDir, assertSafeId(projectId, "project id"));
}

export async function bootstrapLayout(root: string): Promise<ShortPipeLayout> {
  const layout = buildLayout(root);
  await Promise.all([
    mkdir(layout.authDir, { recursive: true }),
    mkdir(layout.piAgentDir, { recursive: true }),
    mkdir(layout.projectsDir, { recursive: true }),
  ]);
  const config = normalizeShortPipeConfig(await readJsonFile<ShortPipeConfig>(layout.configPath));
  await writeJsonFile(layout.configPath, config);
  return layout;
}
