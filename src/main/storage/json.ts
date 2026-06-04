import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

// Monotonic per-process counter so two writes to the same path in the same
// millisecond (e.g. React StrictMode firing an effect twice, or the agent and
// UI both persisting) never collide on one temp file and race the rename.
let tmpSeq = 0;

export async function writeJsonFile(
  path: string,
  value: unknown,
  options: { mode?: number } = {},
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.${tmpSeq++}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: options.mode,
  });
  await rename(tmpPath, path);
  if (options.mode !== undefined) {
    await chmod(path, options.mode);
  }
}

export async function appendJsonl(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const { appendFile } = await import("node:fs/promises");
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

export async function readJsonl<T>(path: string): Promise<T[]> {
  try {
    const raw = await readFile(path, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

export async function removeIfExists(path: string): Promise<void> {
  await rm(path, { force: true, recursive: true });
}
