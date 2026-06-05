import type { DependencyId, DependencyStatus } from "@shared/deps";
import { ProcessError, type RunResult, runProcess } from "../media/runProcess";

/** Just the subprocess surface we need - keeps the checker trivially stubbable. */
type RunFn = (command: string, args: string[]) => Promise<RunResult>;

/** One binary to probe and the args that make it print its version. */
type Binary = { command: string; versionArgs: string[] };

type DependencySpec = {
  id: DependencyId;
  label: string;
  description: string;
  /**
   * Binaries this tool provides, resolved on PATH (matching how the media tools
   * invoke them). The tool is "available" only if all are present; the first
   * provides the displayed version.
   */
  binaries: Binary[];
  parseVersion: (output: string) => string | null;
  installCommand: string;
  setupUrl: string;
};

/** `ffmpeg version 6.1.1 ...` / `ffprobe version n6.0-3ubuntu1 ...`. */
export function parseFfmpegVersion(output: string): string | null {
  const match = output.match(/version\s+(\S+)/i);
  return match ? match[1] : null;
}

/** First semver-ish token, e.g. hyperframes' `--version` output. */
export function parseSemverVersion(output: string): string | null {
  const match = output.match(/\d+\.\d+\.\d+[\w.-]*/);
  return match ? match[0] : null;
}

const FFMPEG_SETUP_URL = "https://ffmpeg.org/download.html";

export const DEPENDENCY_SPECS: DependencySpec[] = [
  {
    id: "ffmpeg",
    label: "FFmpeg",
    description:
      "Decodes audio and reads source metadata for waveforms, silence detection, probing, and rendering. Includes FFprobe.",
    binaries: [
      { command: "ffmpeg", versionArgs: ["-version"] },
      { command: "ffprobe", versionArgs: ["-version"] },
    ],
    parseVersion: parseFfmpegVersion,
    installCommand: "brew install ffmpeg",
    setupUrl: FFMPEG_SETUP_URL,
  },
  {
    id: "hyperframes",
    label: "HyperFrames CLI",
    description: "Runs local Whisper transcription and renders the final shorts.",
    binaries: [{ command: "hyperframes", versionArgs: ["--version"] }],
    parseVersion: parseSemverVersion,
    installCommand: "npm install -g hyperframes",
    setupUrl: "https://github.com/heygen-com/hyperframes",
  },
];

/**
 * Probe a tool by running each of its binaries' version commands. The tool is
 * available only if every binary is present; the first binary's output supplies
 * the displayed version. The setup hints always ride along so the UI can render
 * guidance without re-deriving it.
 */
export async function checkDependency(spec: DependencySpec, run: RunFn): Promise<DependencyStatus> {
  const base = {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    installCommand: spec.installCommand,
    setupUrl: spec.setupUrl,
  };
  const probes = await Promise.all(spec.binaries.map((binary) => probeBinary(binary, run)));
  const available = probes.every((p) => p.present);
  return {
    ...base,
    available,
    version: available ? spec.parseVersion(probes[0].output) : null,
  };
}

type BinaryProbe = { present: boolean; output: string };

/**
 * Run one binary's version command. A clean exit or a non-zero exit both mean it
 * exists (it ran); only a spawn error (ENOENT/EACCES) means it is missing.
 */
async function probeBinary(binary: Binary, run: RunFn): Promise<BinaryProbe> {
  try {
    const result = await run(binary.command, binary.versionArgs);
    return { present: true, output: versionOutput(result) };
  } catch (error) {
    if (error instanceof ProcessError) {
      return { present: true, output: versionOutput(error.result) };
    }
    return { present: false, output: "" };
  }
}

function versionOutput(result: RunResult): string {
  return `${result.stdout}\n${result.stderr}`;
}

/** Probe every pipeline dependency, in declaration order, concurrently. */
export function checkDependencies(
  run: RunFn = (command, args) => runProcess(command, args),
): Promise<DependencyStatus[]> {
  return Promise.all(DEPENDENCY_SPECS.map((spec) => checkDependency(spec, run)));
}
