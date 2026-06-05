import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultShortPipeConfig, type ShortPipeConfig } from "@shared/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsService } from "./settingsService";

let dir: string;
let configPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sp-settings-"));
  configPath = join(dir, "config.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function readConfig(): Promise<ShortPipeConfig> {
  return JSON.parse(await readFile(configPath, "utf8"));
}

describe("SettingsService", () => {
  it("returns the initial config until updated", () => {
    const service = new SettingsService({ configPath, initial: defaultShortPipeConfig() });
    expect(service.get()).toEqual(defaultShortPipeConfig());
  });

  it("merges a patch, exposes it in memory, and persists it to disk", async () => {
    const service = new SettingsService({ configPath, initial: defaultShortPipeConfig() });
    const next = await service.update({
      defaultLayout: "full-bleed",
      defaultOutputDir: "/tmp/out",
    });

    expect(next.defaultLayout).toBe("full-bleed");
    expect(next.defaultOutputDir).toBe("/tmp/out");
    expect(service.get()).toEqual(next);
    expect(await readConfig()).toEqual(next);
  });

  it("clears the output dir when patched with an empty string", async () => {
    const service = new SettingsService({ configPath, initial: defaultShortPipeConfig() });
    await service.update({ defaultOutputDir: "/tmp/out" });
    const cleared = await service.update({ defaultOutputDir: "" });
    expect(cleared.defaultOutputDir).toBeUndefined();
    expect((await readConfig()).defaultOutputDir).toBeUndefined();
  });
});
