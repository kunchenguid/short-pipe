/**
 * Hyperframes streams render progress to stdout as an overwriting line of the
 * shape `… 30%  Capturing frame 30/300`. The percentage already spans the whole
 * pipeline (compile → capture → encode → assemble), so it is the one number we
 * surface to the UI as a determinate progress bar.
 *
 * Returns the latest percentage in the chunk (0-100), or null when the chunk
 * carries no progress redraw. A single stdout chunk can contain several `\r`
 * redraws; the last one is the truthful current state.
 */
export function parseRenderProgress(chunk: string): number | null {
  let percent: number | null = null;
  for (const match of chunk.matchAll(/(\d{1,3})%/g)) {
    percent = Math.max(0, Math.min(100, Number(match[1])));
  }
  return percent;
}
