import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createPackage } from "@electron/asar";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const verifier = join(repoRoot, "scripts", "verify-asar-deps.mjs");

async function createAsar(files: Record<string, unknown>) {
  const tempDir = await mkdtemp(join(tmpdir(), "verify-asar-deps-"));
  const appDir = join(tempDir, "app");
  const asarPath = join(tempDir, "app.asar");
  await mkdir(appDir);
  for (const [path, contents] of Object.entries(files)) {
    const filePath = join(appDir, path);
    await mkdir(join(filePath, ".."), { recursive: true });
    await writeFile(filePath, JSON.stringify(contents));
  }
  await createPackage(appDir, asarPath);
  return { asarPath, tempDir };
}

describe("verify-asar-deps", () => {
  it("fails when the root package declares a missing dependency", async () => {
    const { asarPath, tempDir } = await createAsar({
      "package.json": {
        name: "app",
        dependencies: { "missing-direct": "1.0.0" },
      },
    });

    try {
      await expect(
        execFileAsync(process.execPath, [verifier, asarPath]),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining('"missing-direct" required by app'),
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
