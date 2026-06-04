import { copyFile, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import type {
  Candidate,
  Silence,
  Theme,
  TitleStyle,
  TranscriptWord,
  VideoFit,
} from "@shared/project";
import { buildShortComposition } from "./composition";
import { type RunOptions, runProcess } from "./runProcess";

export type RenderOptions = {
  /** Absolute path to the long-form source video. */
  sourcePath: string;
  candidate: Pick<
    Candidate,
    "startTime" | "endTime" | "layout" | "captionStyle" | "keywords" | "title"
  > & { titleStyle?: TitleStyle; theme?: Theme; videoFit?: VideoFit };
  words: TranscriptWord[];
  /** Detected pauses; clip boundaries snap to them when present. */
  silences?: Silence[];
  /** Source length in seconds, so the trim can't run past the end. */
  sourceDuration?: number;
  /** Source pixel dimensions, used to size a `full` (uncropped) video box. */
  sourceWidth?: number;
  sourceHeight?: number;
  /** Absolute output path for the rendered clip (.mp4). */
  outputPath: string;
  /** Scratch directory for the composition project; created and removed here. */
  workDir: string;
  fps?: number;
  quality?: "draft" | "standard" | "high";
  hyperframesPath?: string;
  run?: typeof runProcess;
  signal?: RunOptions["signal"];
  onProgress?: (chunk: string) => void;
};

export function buildRenderArgs(
  workDir: string,
  outputPath: string,
  options: { fps?: number; quality?: RenderOptions["quality"] } = {},
): string[] {
  const args = ["render", workDir, "-o", outputPath, "--resolution", "portrait"];
  if (options.fps) args.push("-f", String(options.fps));
  if (options.quality) args.push("-q", options.quality);
  return args;
}

const HYPERFRAMES_JSON = JSON.stringify(
  {
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
  },
  null,
  2,
);

/** Make the source available inside the render project dir without copying when possible. */
async function linkSource(sourcePath: string, dest: string): Promise<void> {
  await rm(dest, { force: true });
  try {
    await symlink(sourcePath, dest);
  } catch {
    await copyFile(sourcePath, dest);
  }
}

/**
 * Render one short locally: assemble a HyperFrames composition project that
 * trims the source to the candidate's range and burns in captions, then run the
 * headless-Chrome + ffmpeg render to a 1080x1920 MP4. Returns the output path.
 */
export async function renderShort(options: RenderOptions): Promise<{ outputPath: string }> {
  const run = options.run ?? runProcess;
  const sourceFileName = `source${extname(options.sourcePath) || ".mp4"}`;

  await rm(options.workDir, { recursive: true, force: true });
  await mkdir(options.workDir, { recursive: true });
  await linkSource(options.sourcePath, join(options.workDir, sourceFileName));
  await writeFile(
    join(options.workDir, "index.html"),
    buildShortComposition({
      sourceFileName,
      candidate: options.candidate,
      words: options.words,
      silences: options.silences,
      sourceDuration: options.sourceDuration,
      sourceWidth: options.sourceWidth,
      sourceHeight: options.sourceHeight,
    }),
    "utf8",
  );
  await writeFile(join(options.workDir, "hyperframes.json"), HYPERFRAMES_JSON, "utf8");
  await mkdir(dirname(options.outputPath), { recursive: true });

  await run(
    options.hyperframesPath ?? "hyperframes",
    buildRenderArgs(options.workDir, options.outputPath, {
      fps: options.fps,
      quality: options.quality,
    }),
    { signal: options.signal, onStdout: options.onProgress, onStderr: options.onProgress },
  );

  return { outputPath: options.outputPath };
}
