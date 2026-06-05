import { spawn } from "node:child_process";
import type { RunOptions } from "./runProcess";

/** Sample rate we decode the window at: low enough to be cheap, high enough for shape. */
export const WAVEFORM_SAMPLE_RATE = 8000;
/** Full-scale magnitude of a signed 16-bit PCM sample. */
const INT16_SCALE = 32768;

/**
 * Downsample interleaved signed-16-bit little-endian **mono** PCM into `bins`
 * peak magnitudes in 0..1 (the loudest absolute sample in each evenly-sized
 * slice). Pure - the renderer draws these directly as bar heights. Returns a
 * zero-filled array when there are no samples, and `[]` for a non-positive bin
 * count, so the caller never has to special-case an empty window.
 */
export function peaksFromPcm(pcm: Buffer, bins: number): number[] {
  if (bins <= 0) return [];
  const sampleCount = Math.floor(pcm.length / 2);
  const peaks = new Array<number>(bins).fill(0);
  if (sampleCount === 0) return peaks;
  for (let b = 0; b < bins; b++) {
    const lo = Math.floor((b * sampleCount) / bins);
    // At least one sample per bin even when bins > sampleCount.
    const hi = Math.min(sampleCount, Math.max(lo + 1, Math.floor(((b + 1) * sampleCount) / bins)));
    let peak = 0;
    for (let i = lo; i < hi; i++) {
      const v = Math.abs(pcm.readInt16LE(i * 2));
      if (v > peak) peak = v;
    }
    peaks[b] = peak / INT16_SCALE;
  }
  return peaks;
}

export type ExtractPeaksOptions = {
  /** Window start, seconds from the source start. */
  from: number;
  /** Window end, seconds from the source start. */
  to: number;
  /** How many peak bars to produce across the window. */
  bins: number;
  ffmpegPath?: string;
  signal?: RunOptions["signal"];
};

/** ffmpeg args that decode just [from, to] of the audio to raw mono PCM on stdout. */
export function buildWaveformArgs(input: string, from: number, to: number): string[] {
  // -ss before -i is a fast input seek; -t bounds the decoded duration so we never
  // touch more of the file than the visible window needs. Duration is measured
  // from the clamped seek so a negative `from` can't inflate it.
  const seek = Math.max(0, from);
  return [
    "-hide_banner",
    "-nostats",
    "-ss",
    String(seek),
    "-i",
    input,
    "-t",
    String(Math.max(0, to - seek)),
    "-vn",
    "-ac",
    "1",
    "-ar",
    String(WAVEFORM_SAMPLE_RATE),
    "-f",
    "s16le",
    "-",
  ];
}

/**
 * Decode the [from, to] audio window of a source file into `bins` waveform peaks.
 * Unlike {@link runProcess}, this collects stdout as raw `Buffer` chunks - the PCM
 * is binary, and stringifying it would corrupt the samples. One short-lived ffmpeg
 * pass per call; the UI requests only the window it is showing.
 */
export async function extractPeaks(
  sourcePath: string,
  options: ExtractPeaksOptions,
): Promise<number[]> {
  const { from, to, bins } = options;
  if (bins <= 0 || to <= from) return new Array<number>(Math.max(0, bins)).fill(0);
  const pcm = await decodeWindowPcm(sourcePath, options);
  return peaksFromPcm(pcm, bins);
}

function decodeWindowPcm(sourcePath: string, options: ExtractPeaksOptions): Promise<Buffer> {
  const { from, to, ffmpegPath, signal } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath ?? "ffmpeg", buildWaveformArgs(sourcePath, from, to), {
      // Own process group so an abort kills the whole tree (matches runProcess).
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    let stderr = "";
    let aborted = false;

    const onAbort = () => {
      aborted = true;
      killTree(child.pid);
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout?.on("data", (buf: Buffer) => chunks.push(buf));
    child.stderr?.on("data", (buf: Buffer) => {
      stderr += buf.toString();
    });

    child.on("error", (error) => {
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });

    child.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      if (aborted) {
        reject(new Error("waveform extraction aborted"));
      } else if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`.slice(0, 2000)));
      }
    });
  });
}

function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/t", "/f"]);
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // Process already gone.
  }
}
