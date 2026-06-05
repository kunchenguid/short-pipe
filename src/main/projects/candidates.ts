import type {
  Candidate,
  CandidateProposal,
  LayoutKind,
  Theme,
  TitleStyle,
  TranscriptWord,
  VideoFit,
} from "@shared/project";
import { CAPTION_STYLES, LAYOUT_KINDS, THEMES, TITLE_STYLES, VIDEO_FITS } from "@shared/project";

/**
 * Resolve the inclusive [startWordId, endWordId] span to a time range using the
 * transcript words. Throws if either id is missing or the range is inverted, so
 * a bad agent proposal fails loudly instead of producing a zero-length clip.
 */
export function wordTimeRange(
  words: TranscriptWord[],
  startWordId: string,
  endWordId: string,
): { startTime: number; endTime: number } {
  const start = words.find((w) => w.id === startWordId);
  const end = words.find((w) => w.id === endWordId);
  if (!start) throw new Error(`Unknown start word id: ${startWordId}`);
  if (!end) throw new Error(`Unknown end word id: ${endWordId}`);
  if (end.end < start.start) {
    throw new Error(`Inverted word range: ${startWordId}..${endWordId}`);
  }
  return { startTime: start.start, endTime: end.end };
}

function normalizeLayout(value: string | undefined): LayoutKind {
  // "card" was the old key for what is now the top-square layout; map it so
  // older proposals/projects keep rendering without a migration.
  if (value === "card") return "top-square";
  return value && (LAYOUT_KINDS as string[]).includes(value)
    ? (value as LayoutKind)
    : "center-square";
}

function normalizeCaptionStyle(
  value: CandidateProposal["captionStyle"],
): Candidate["captionStyle"] {
  return value && CAPTION_STYLES.includes(value) ? value : "clean";
}

function normalizeTitleStyle(value: TitleStyle | undefined): TitleStyle {
  // A kicker rule gives the title the brand vermillion accent by default, so it
  // never looks plain; the agent/user can switch to plain/masthead/eyebrow.
  return value && TITLE_STYLES.includes(value) ? value : "kicker";
}

function normalizeTheme(value: Theme | undefined): Theme {
  // Dark is the default polarity shorts render in; the user/agent can switch to light.
  return value && THEMES.includes(value) ? value : "dark";
}

function normalizeVideoFit(value: VideoFit | undefined): VideoFit {
  // Full preserves the source aspect by default; square crops it tight.
  return value && VIDEO_FITS.includes(value) ? value : "full";
}

/**
 * Turn an agent proposal into a stored candidate: validate the word range,
 * cache the derived timing, and fill defaults for layout/caption/keywords.
 */
export function candidateFromProposal(
  proposal: CandidateProposal,
  words: TranscriptWord[],
  id: string,
): Candidate {
  const { startTime, endTime } = wordTimeRange(words, proposal.startWordId, proposal.endWordId);
  return {
    id,
    title: proposal.title.trim() || "Untitled short",
    reason: proposal.reason?.trim() || undefined,
    rank: Number.isFinite(proposal.rank) ? proposal.rank : 999,
    startWordId: proposal.startWordId,
    endWordId: proposal.endWordId,
    startTime,
    endTime,
    layout: normalizeLayout(proposal.layout),
    captionStyle: normalizeCaptionStyle(proposal.captionStyle),
    titleStyle: normalizeTitleStyle(proposal.titleStyle),
    theme: normalizeTheme(proposal.theme),
    videoFit: normalizeVideoFit(proposal.videoFit),
    keywords: (proposal.keywords ?? []).map((k) => k.trim()).filter(Boolean),
    status: "proposed",
  };
}

/** Sort candidates by rank ascending (best first), stable on ties. */
export function sortByRank(candidates: Candidate[]): Candidate[] {
  return candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.rank - b.c.rank || a.i - b.i)
    .map(({ c }) => c);
}
