import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Transcript, TranscriptWord } from "@shared/project";
import { type RunOptions, runProcess } from "./runProcess";

export type TranscribeOptions = {
  /** Whisper model. Use a `.en` model only for known-English audio. */
  model?: string;
  /** Language code (e.g. "en", "es"); omit to auto-detect. */
  language?: string;
  hyperframesPath?: string;
  run?: typeof runProcess;
  signal?: RunOptions["signal"];
  onProgress?: (chunk: string) => void;
};

export const DEFAULT_WHISPER_MODEL = "small.en";

export function buildTranscribeArgs(
  input: string,
  dir: string,
  options: TranscribeOptions,
): string[] {
  const args = ["transcribe", input, "-d", dir];
  if (options.model) args.push("-m", options.model);
  if (options.language) args.push("-l", options.language);
  return args;
}

type RawWord = { id?: unknown; text?: unknown; start?: unknown; end?: unknown };

/**
 * Normalize HyperFrames' flat transcript array (`[{text,start,end}]`) into our
 * canonical shape, assigning stable sequential word ids (w0, w1, ...) that
 * candidates reference. Tolerates entries that already carry an id.
 */
export function normalizeTranscript(raw: unknown): Transcript {
  const arr = Array.isArray(raw) ? raw : ((raw as { words?: unknown })?.words ?? []);
  const list = Array.isArray(arr) ? arr : [];
  const words: TranscriptWord[] = [];
  for (let i = 0; i < list.length; i++) {
    const w = list[i] as RawWord;
    const text = typeof w.text === "string" ? w.text : "";
    const start = Number(w.start);
    const end = Number(w.end);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    words.push({ id: `w${words.length}`, text, start, end });
  }
  return { words };
}

/**
 * Transcribe a media file with local Whisper via HyperFrames, returning our
 * normalized transcript. HyperFrames writes its own `transcript.json` into a
 * scratch dir; we read, normalize, and hand back the result so the caller can
 * store it at the canonical project path.
 */
export async function transcribeMedia(
  input: string,
  options: TranscribeOptions = {},
): Promise<Transcript> {
  const run = options.run ?? runProcess;
  const scratch = await mkdtemp(join(tmpdir(), "short-pipe-transcribe-"));
  try {
    await run(
      options.hyperframesPath ?? "hyperframes",
      buildTranscribeArgs(input, scratch, {
        model: options.model ?? DEFAULT_WHISPER_MODEL,
        language: options.language,
      }),
      {
        signal: options.signal,
        onStdout: options.onProgress,
        onStderr: options.onProgress,
      },
    );
    const raw = await readFile(join(scratch, "transcript.json"), "utf8");
    return normalizeTranscript(JSON.parse(raw));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
