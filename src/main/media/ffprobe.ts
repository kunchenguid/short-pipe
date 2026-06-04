import { type RunOptions, runProcess } from "./runProcess";

export type ProbeResult = {
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
};

export function buildFfprobeArgs(path: string): string[] {
  return ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path];
}

/** Parse an ffmpeg-style rational like "30000/1001" or "30/1" into fps. */
export function parseFrameRate(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const [num, den] = value.split("/").map(Number);
  if (!Number.isFinite(num)) return undefined;
  const denom = Number.isFinite(den) && den !== 0 ? den : 1;
  const fps = num / denom;
  if (!Number.isFinite(fps) || fps <= 0) return undefined;
  return Math.round(fps * 1000) / 1000;
}

type FfprobeStream = {
  codec_type?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
};

type FfprobeJson = {
  streams?: FfprobeStream[];
  format?: { duration?: string };
};

export function parseFfprobe(raw: string): ProbeResult {
  const json = JSON.parse(raw) as FfprobeJson;
  const video = json.streams?.find((s) => s.codec_type === "video");
  const durationStr = json.format?.duration ?? video?.duration;
  const duration = durationStr !== undefined ? Number(durationStr) : undefined;
  return {
    duration: Number.isFinite(duration) ? duration : undefined,
    width: video?.width,
    height: video?.height,
    fps: parseFrameRate(video?.avg_frame_rate) ?? parseFrameRate(video?.r_frame_rate),
  };
}

export async function probeVideo(
  path: string,
  options: { ffprobePath?: string; run?: typeof runProcess; signal?: RunOptions["signal"] } = {},
): Promise<ProbeResult> {
  const run = options.run ?? runProcess;
  const result = await run(options.ffprobePath ?? "ffprobe", buildFfprobeArgs(path), {
    signal: options.signal,
  });
  return parseFfprobe(result.stdout);
}
