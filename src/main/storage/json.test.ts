import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readJsonFile, writeJsonFile } from "./json";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "short-pipe-json-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("writeJsonFile", () => {
  it("writes and reads back JSON", async () => {
    const file = join(await tempDir(), "x.json");
    await writeJsonFile(file, { a: 1 });
    expect(await readJsonFile(file)).toEqual({ a: 1 });
  });

  it("survives many concurrent writes to the same path without ENOENT", async () => {
    // Reproduces the probe race: React StrictMode fires the mount effect twice,
    // so two probe->persist->writeJsonFile calls hit project.json in the same
    // millisecond. The atomic-rename temp name must be unique per call.
    const file = join(await tempDir(), "project.json");
    await expect(
      Promise.all(Array.from({ length: 25 }, (_, i) => writeJsonFile(file, { i }))),
    ).resolves.toBeDefined();
    const final = JSON.parse(await readFile(file, "utf8")) as { i: number };
    expect(Number.isInteger(final.i)).toBe(true);
  });
});
