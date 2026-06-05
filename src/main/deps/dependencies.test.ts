import { describe, expect, it, vi } from "vitest";
import { ProcessError, type RunResult } from "../media/runProcess";
import {
  checkDependencies,
  checkDependency,
  DEPENDENCY_SPECS,
  parseFfmpegVersion,
  parseSemverVersion,
} from "./dependencies";

const ok = (stdout: string, stderr = ""): RunResult => ({ code: 0, stdout, stderr });

describe("parseFfmpegVersion", () => {
  it("reads the version token from ffmpeg's banner", () => {
    expect(parseFfmpegVersion("ffmpeg version 6.1.1 Copyright (c) 2000-2023")).toBe("6.1.1");
  });

  it("reads a distro-tagged ffprobe version", () => {
    expect(parseFfmpegVersion("ffprobe version n6.0-3ubuntu1 Copyright")).toBe("n6.0-3ubuntu1");
  });

  it("returns null when no version token is present", () => {
    expect(parseFfmpegVersion("command not found")).toBeNull();
  });
});

describe("parseSemverVersion", () => {
  it("extracts a bare semver", () => {
    expect(parseSemverVersion("1.4.2")).toBe("1.4.2");
  });

  it("extracts a semver embedded in noisier output", () => {
    expect(parseSemverVersion("hyperframes/2.0.0-beta.3 node-v20")).toBe("2.0.0-beta.3");
  });

  it("returns null without a semver", () => {
    expect(parseSemverVersion("unknown")).toBeNull();
  });
});

describe("checkDependency", () => {
  const ffmpeg = DEPENDENCY_SPECS[0]; // ffmpeg + ffprobe, tracked together
  const hyperframes = DEPENDENCY_SPECS[1]; // single binary

  it("reports available with a parsed version when every binary resolves", async () => {
    const run = vi.fn(async (command: string) => ok(`${command} version 6.1.1 Copyright`));
    const status = await checkDependency(ffmpeg, run);
    // Probes both binaries the tool bundles.
    expect(run.mock.calls.map((c) => c[0])).toEqual(["ffmpeg", "ffprobe"]);
    expect(status).toMatchObject({ id: "ffmpeg", available: true, version: "6.1.1" });
  });

  it("treats a non-zero exit (binary ran) as present", async () => {
    const run = vi.fn(async () => {
      throw new ProcessError("boom", ok("hyperframes 5.0.0 weird flag", "err"));
    });
    const status = await checkDependency(hyperframes, run);
    expect(status.available).toBe(true);
    expect(status.version).toBe("5.0.0");
  });

  it("is unavailable if any bundled binary is missing", async () => {
    // ffmpeg present, ffprobe missing -> the whole FFmpeg entry is unavailable.
    const run = vi.fn(async (command: string) => {
      if (command === "ffprobe") {
        throw Object.assign(new Error("spawn ffprobe ENOENT"), { code: "ENOENT" });
      }
      return ok("ffmpeg version 6.1.1");
    });
    const status = await checkDependency(ffmpeg, run);
    expect(status).toMatchObject({ available: false, version: null });
    // Setup guidance is always carried so the UI can show it when unavailable.
    expect(status.installCommand).toBeTruthy();
    expect(status.setupUrl).toMatch(/^https?:\/\//);
  });
});

describe("checkDependencies", () => {
  it("checks every spec and preserves order", async () => {
    const run = vi.fn(async (command: string) => ok(`${command} version 1.2.3`));
    const statuses = await checkDependencies(run);
    expect(statuses.map((s) => s.id)).toEqual(DEPENDENCY_SPECS.map((s) => s.id));
    expect(statuses.every((s) => s.available)).toBe(true);
  });

  it("tracks ffmpeg (with ffprobe) and hyperframes", () => {
    expect(DEPENDENCY_SPECS.map((s) => s.id)).toEqual(["ffmpeg", "hyperframes"]);
    const ffmpeg = DEPENDENCY_SPECS[0];
    expect(ffmpeg.binaries.map((b) => b.command)).toEqual(["ffmpeg", "ffprobe"]);
  });

  it("points the hyperframes setup at its GitHub repo", () => {
    const hyperframes = DEPENDENCY_SPECS.find((s) => s.id === "hyperframes");
    expect(hyperframes?.setupUrl).toBe("https://github.com/heygen-com/hyperframes");
  });
});
