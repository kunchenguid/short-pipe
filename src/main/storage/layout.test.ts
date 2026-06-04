import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSafeId,
  bootstrapLayout,
  buildLayout,
  projectDir,
  resolveShortPipeRoot,
} from "./layout";

const dirs: string[] = [];
async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "short-pipe-layout-"));
  dirs.push(root);
  return root;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("resolveShortPipeRoot", () => {
  it("defaults to ~/.short-pipe in the user's home directory", () => {
    expect(resolveShortPipeRoot("/Users/sam")).toBe("/Users/sam/.short-pipe");
  });

  it("relocates under an isolated data dir when one is given (dev instances)", () => {
    expect(resolveShortPipeRoot("/Users/sam", "/tmp/isolated")).toBe("/tmp/isolated/short-pipe");
  });

  it("ignores an empty/blank isolated dir and falls back to the home default", () => {
    expect(resolveShortPipeRoot("/Users/sam", "")).toBe("/Users/sam/.short-pipe");
    expect(resolveShortPipeRoot("/Users/sam", "  ")).toBe("/Users/sam/.short-pipe");
    expect(resolveShortPipeRoot("/Users/sam", null)).toBe("/Users/sam/.short-pipe");
  });
});

describe("buildLayout", () => {
  it("derives all paths under the root", () => {
    const layout = buildLayout("/data/short-pipe");
    expect(layout.configPath).toBe("/data/short-pipe/config.json");
    expect(layout.codexAuthPath).toBe("/data/short-pipe/auth/codex.json");
    expect(layout.piAgentDir).toBe("/data/short-pipe/pi-agent");
    expect(layout.projectsDir).toBe("/data/short-pipe/projects");
  });
});

describe("assertSafeId", () => {
  it("accepts slug ids", () => {
    expect(assertSafeId("abc-123_XY")).toBe("abc-123_XY");
  });

  it("rejects path traversal and separators", () => {
    expect(() => assertSafeId("../etc", "project id")).toThrow(/Invalid project id/);
    expect(() => assertSafeId("a/b")).toThrow(/Invalid id/);
  });
});

describe("projectDir", () => {
  it("joins a safe id under projectsDir", () => {
    const layout = buildLayout("/data/short-pipe");
    expect(projectDir(layout, "vid1")).toBe("/data/short-pipe/projects/vid1");
  });
});

describe("bootstrapLayout", () => {
  it("creates the directory tree and a default config", async () => {
    const root = await tempRoot();
    const layout = await bootstrapLayout(join(root, "short-pipe"));
    await expect(stat(layout.authDir)).resolves.toBeDefined();
    await expect(stat(layout.piAgentDir)).resolves.toBeDefined();
    await expect(stat(layout.projectsDir)).resolves.toBeDefined();
    const config = JSON.parse(await readFile(layout.configPath, "utf8"));
    expect(config.defaultModel).toBeTruthy();
    expect(config.version).toBe(1);
  });

  it("is idempotent on a second run", async () => {
    const root = await tempRoot();
    const dir = join(root, "short-pipe");
    await bootstrapLayout(dir);
    await expect(bootstrapLayout(dir)).resolves.toBeDefined();
  });
});
