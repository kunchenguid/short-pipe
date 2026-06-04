import type { Silence } from "@shared/project";
import { type RunOptions, runProcess } from "./runProcess";

export type DetectSilenceOptions = {
  /** Silence threshold in dB (anything quieter counts as silence). */
  noiseDb?: number;
  /** Minimum silence length in seconds to report (filters intra-word stop gaps). */
  minDuration?: number;
  ffmpegPath?: string;
  run?: typeof runProcess;
  signal?: RunOptions["signal"];
};

/** ffmpeg args that decode audio only and print pause boundaries to stderr. */
export function buildSilenceArgs(
  input: string,
  opts: { noiseDb: number; minDuration: number },
): string[] {
  return [
    "-hide_banner",
    "-nostats",
    "-i",
    input,
    "-vn",
    "-af",
    `silencedetect=noise=${opts.noiseDb}dB:d=${opts.minDuration}`,
    "-f",
    "null",
    "-",
  ];
}

/** Pair `silence_start:`/`silence_end:` lines from silencedetect's stderr. */
export function parseSilences(output: string): Silence[] {
  const silences: Silence[] = [];
  let start: number | null = null;
  for (const line of output.split("\n")) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) {
      start = Number(s[1]);
      continue;
    }
    const e = /silence_end:\s*(-?[\d.]+)/.exec(line);
    if (e && start !== null) {
      silences.push({ start, end: Number(e[1]) });
      start = null;
    }
  }
  return silences;
}

/**
 * Detect real pauses in the source audio. Whisper word timestamps jitter ~±0.25s,
 * so these acoustic pauses are the reliable signal for snapping clip boundaries.
 * One ffmpeg pass; safe to run once after transcription.
 */
export async function detectSilences(
  sourcePath: string,
  options: DetectSilenceOptions = {},
): Promise<Silence[]> {
  const run = options.run ?? runProcess;
  const noiseDb = options.noiseDb ?? -30;
  // 80ms catches word-boundary gaps (e.g. the stop before the next word) that
  // sentence-length thresholds miss, which is exactly where clips want to end.
  const minDuration = options.minDuration ?? 0.08;
  // silencedetect writes its report to stderr; ffmpeg exits 0 with the null sink.
  const result = await run(
    options.ffmpegPath ?? "ffmpeg",
    buildSilenceArgs(sourcePath, {
      noiseDb,
      minDuration,
    }),
    {
      signal: options.signal,
    },
  );
  return parseSilences(`${result.stderr}\n${result.stdout}`);
}
