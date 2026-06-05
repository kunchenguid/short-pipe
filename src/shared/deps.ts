/**
 * The external CLI tools the on-device pipeline shells out to. FFmpeg and
 * FFprobe ship together, so they are tracked as one "ffmpeg" entry.
 */
export type DependencyId = "ffmpeg" | "hyperframes";

/**
 * Result of probing one external tool on PATH. The renderer's startup checklist
 * uses this to tell the user what is ready and how to install what is not,
 * before they ever start a project.
 */
export type DependencyStatus = {
  id: DependencyId;
  /** Display name, e.g. "FFmpeg". */
  label: string;
  /** One-line role in the pipeline. */
  description: string;
  /** Whether every binary the tool provides was found and runnable on PATH. */
  available: boolean;
  /** Parsed version string when available, else null (found but version unread). */
  version: string | null;
  /** Shell command that installs it, shown when unavailable. */
  installCommand: string;
  /** Docs/download URL for manual setup. */
  setupUrl: string;
};
