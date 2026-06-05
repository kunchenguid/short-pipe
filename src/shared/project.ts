/**
 * The Short Pipe domain model.
 *
 * The project folder under `~/.short-pipe/projects/<id>/` is the single
 * source of truth: `project.json` holds this record, `transcript.json` holds the
 * words. Both the React UI and the agent's tools mutate the project through the
 * same store in main, which persists and emits a `project_updated` event so the
 * other side re-renders.
 */

/** One word with its timing, matching the normalized HyperFrames transcript shape. */
export type TranscriptWord = {
  /** Stable id ("w0", "w1", ...) for referencing word ranges in candidates. */
  id: string;
  text: string;
  /** Seconds from the start of the source video. */
  start: number;
  end: number;
};

/** An acoustic pause (silence) in the source audio, in seconds. */
export type Silence = {
  start: number;
  end: number;
};

export type Transcript = {
  words: TranscriptWord[];
  /**
   * Real pauses detected from the audio (ffmpeg silencedetect). Whisper's word
   * timestamps jitter by ~±0.25s, so clip boundaries snap to these instead.
   * Optional: older transcripts predate it and fall back to a fixed pad.
   */
  silences?: Silence[];
};

/**
 * Vertical layout for a rendered short.
 * - `top-square`: a full-width square video pinned to the top edges, with the
 *   title and captions stacked in the open space below it.
 * - `center-square`: a full-width square video centered vertically, the title
 *   above it and the captions below.
 * - `full-bleed`: the video fills the whole frame, captions float over it.
 */
export type LayoutKind = "top-square" | "center-square" | "full-bleed";

/** Caption rendering style, defined by the shorts-from-longform skill. */
export type CaptionStyle = "clean" | "karaoke" | "bold-pop";

/**
 * How the static title is dressed on the square layouts (ignored by full-bleed,
 * which shows no title).
 * - `plain`: the serif headline on its own.
 * - `kicker`: a short vermillion rule above the headline.
 * - `masthead`: an italic headline flanked by thin rules.
 * - `eyebrow`: a small uppercase keyword label above the headline.
 */
export type TitleStyle = "plain" | "kicker" | "masthead" | "eyebrow";

/**
 * Color polarity for a rendered short, orthogonal to layout/caption/title. It
 * sets the palette every style draws from:
 * - `light`: paper page + ink text; full-bleed captions are ink on a light scrim.
 * - `dark`: ink page + warm off-white text; full-bleed captions are off-white on
 *   a dark scrim.
 */
export type Theme = "light" | "dark";

/**
 * How the video fills its frame on the square (non-full-bleed) layouts:
 * - `square`: cropped to a 1:1 square (object-fit: cover).
 * - `full`: the whole source frame, uncropped, at its real aspect ratio. The
 *   video box resizes to the source aspect and the title/captions reflow under it.
 * Ignored by full-bleed, which always fills the frame.
 */
export type VideoFit = "square" | "full";

export const LAYOUT_KINDS: LayoutKind[] = ["top-square", "center-square", "full-bleed"];
export const CAPTION_STYLES: CaptionStyle[] = ["clean", "karaoke", "bold-pop"];
export const TITLE_STYLES: TitleStyle[] = ["plain", "kicker", "masthead", "eyebrow"];
export const THEMES: Theme[] = ["light", "dark"];
export const VIDEO_FITS: VideoFit[] = ["square", "full"];

export type CandidateStatus = "proposed" | "approved" | "rejected" | "rendered";

/**
 * A proposed (or approved) soundbite. The agent proposes these; the user trims,
 * retemplates, and approves them; the renderer turns approved ones into clips.
 */
export type Candidate = {
  id: string;
  /** Short human label, e.g. "The real reason layoffs happen". */
  title: string;
  /** Agent rationale for why this makes a good short. */
  reason?: string;
  /** Agent ranking, 1 = strongest. */
  rank: number;
  /** Inclusive word-id range into the transcript. */
  startWordId: string;
  endWordId: string;
  /** Seconds, cached from the word range for quick display and cutting. */
  startTime: number;
  endTime: number;
  /**
   * Manual cut override (seconds on the source timeline), set by dragging the
   * waveform trimmer. When BOTH are present they replace the silence-snapped
   * window for preview and render, giving sub-word precision. Cleared whenever
   * the word range changes (re-selecting words is the "start over" gesture).
   */
  cutStart?: number;
  cutEnd?: number;
  layout: LayoutKind;
  captionStyle: CaptionStyle;
  /** How the static title is dressed on the square layouts. */
  titleStyle: TitleStyle;
  /** Color polarity applied across every style. */
  theme: Theme;
  /** Whether the video is cropped square or shown at its full aspect (square layouts). */
  videoFit: VideoFit;
  /** Words/phrases to emphasize in the captions. */
  keywords: string[];
  status: CandidateStatus;
  /** Absolute path to the rendered clip, set once status is "rendered". */
  renderedPath?: string;
};

/** A candidate as proposed by the agent, before the store fills in ids/derived timing. */
export type CandidateProposal = {
  title: string;
  reason?: string;
  rank: number;
  startWordId: string;
  endWordId: string;
  /** Falls back to Settings default layout when omitted or invalid. */
  layout?: LayoutKind;
  captionStyle?: CaptionStyle;
  titleStyle?: TitleStyle;
  /** Falls back to Settings default theme when omitted or invalid. */
  theme?: Theme;
  /** Defaults to full when omitted or invalid. */
  videoFit?: VideoFit;
  keywords?: string[];
};

export type ProjectSource = {
  /** Absolute path to the long-form source video. It stays in place on disk. */
  path: string;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
};

export type TranscriptStatus = "none" | "running" | "ready" | "failed";

export type Project = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  source: ProjectSource;
  /** Legacy per-project output override; effective output now comes from Settings or project `output/`. */
  outputDir?: string;
  transcriptStatus: TranscriptStatus;
  candidates: Candidate[];
  /** pi session file for resuming the agent conversation. */
  agentSessionFile?: string;
};

export type ProjectSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sourcePath: string;
  candidateCount: number;
  transcriptStatus: TranscriptStatus;
};

export type CreateProjectInput = {
  sourcePath: string;
  title?: string;
};

/** Fields the UI may patch on a candidate. */
export type CandidatePatch = Partial<
  Pick<
    Candidate,
    | "title"
    | "startWordId"
    | "endWordId"
    | "cutStart"
    | "cutEnd"
    | "layout"
    | "captionStyle"
    | "titleStyle"
    | "theme"
    | "videoFit"
    | "keywords"
    | "status"
  >
>;

/** Smallest number of shorts the agent is ever asked to find. */
export const MIN_SHORT_COUNT = 2;

/**
 * The default number of shorts to propose for a source: one per minute of video,
 * floored at {@link MIN_SHORT_COUNT}. There is no upper cap - a long talk yields
 * proportionally more shorts. Returns the floor when the duration is unknown.
 */
export function defaultShortCount(durationSeconds?: number): number {
  if (!durationSeconds || durationSeconds <= 0) return MIN_SHORT_COUNT;
  return Math.max(MIN_SHORT_COUNT, Math.round(durationSeconds / 60));
}

export function projectSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    title: project.title,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    sourcePath: project.source.path,
    candidateCount: project.candidates.length,
    transcriptStatus: project.transcriptStatus,
  };
}
