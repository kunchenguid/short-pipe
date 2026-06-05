import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { CandidateProposal } from "@shared/project";
import { Type } from "typebox";
import {
  type MediaDeps,
  probeProject,
  realMediaDeps,
  renderCandidate,
  transcribeProject,
} from "../projects/projectOps";
import type { ProjectService } from "../projects/projectService";

export type VideoToolDeps = {
  projects: ProjectService;
  /** The project this agent session is scoped to. */
  projectId: string;
  media?: MediaDeps;
};

const ProposalSchema = Type.Object({
  title: Type.String({ description: "Short, punchy label for the short (a viewer-facing hook)." }),
  reason: Type.Optional(Type.String({ description: "Why this moment makes a strong short." })),
  rank: Type.Integer({ minimum: 1, description: "Ranking, 1 = strongest." }),
  startWordId: Type.String({
    description: "Transcript word id where the clip starts (e.g. 'w42').",
  }),
  endWordId: Type.String({ description: "Transcript word id where the clip ends (inclusive)." }),
  layout: Type.Optional(
    Type.Union(
      [Type.Literal("top-square"), Type.Literal("center-square"), Type.Literal("full-bleed")],
      {
        description:
          "Omit layout, captionStyle, and theme unless the footage needs a specific presentation that should override the user's Settings defaults. top-square = square video at the top of a paper page, title + captions below; center-square = square video centered, title above and captions below; full-bleed = video fills the screen with captions over it.",
      },
    ),
  ),
  captionStyle: Type.Optional(
    Type.Union([Type.Literal("clean"), Type.Literal("karaoke"), Type.Literal("bold-pop")]),
  ),
  titleStyle: Type.Optional(
    Type.Union(
      [
        Type.Literal("plain"),
        Type.Literal("kicker"),
        Type.Literal("masthead"),
        Type.Literal("eyebrow"),
      ],
      {
        description:
          "How the static title is dressed on the square layouts: plain = serif headline alone; kicker = a vermillion rule above it; masthead = italic headline flanked by rules; eyebrow = the top keyword as an uppercase label above it. Ignored by full-bleed.",
      },
    ),
  ),
  theme: Type.Optional(
    Type.Union([Type.Literal("light"), Type.Literal("dark")], {
      description:
        "Override the user's Settings default only when the footage needs a specific color polarity: light = paper page + ink text; dark = ink page + warm off-white text.",
    }),
  ),
  videoFit: Type.Optional(
    Type.Union([Type.Literal("square"), Type.Literal("full")], {
      description:
        "How the video fills its frame on the square layouts: square = cropped to 1:1 (default); full = the whole source frame uncropped at its real aspect ratio (best when the framing matters, e.g. a chart or screen share). Ignored by full-bleed.",
    }),
  ),
  keywords: Type.Optional(
    Type.Array(Type.String(), { description: "Words to emphasize in the captions." }),
  ),
});

export function createVideoTools(deps: VideoToolDeps): ToolDefinition[] {
  const media = deps.media ?? realMediaDeps;
  const { projects, projectId } = deps;

  const probe = defineTool({
    name: "probe",
    label: "Probe video",
    description:
      "Read the source video's duration, resolution, and fps. Run this first if you do not know the source dimensions.",
    parameters: Type.Object({}),
    async execute(_callId, _params, signal) {
      const project = await probeProject(projects, projectId, media, signal ?? undefined);
      const s = project.source;
      return {
        content: [
          {
            type: "text" as const,
            text: `Source: ${s.width ?? "?"}x${s.height ?? "?"} @ ${s.fps ?? "?"}fps, ${
              s.duration !== undefined ? `${s.duration.toFixed(1)}s` : "unknown length"
            }.`,
          },
        ],
        details: { width: s.width, height: s.height, fps: s.fps, duration: s.duration },
      };
    },
  });

  const transcribe = defineTool({
    name: "transcribe",
    label: "Transcribe (local Whisper)",
    description:
      "Run local Whisper on the source to produce transcript.json with word-level timestamps. Run once; skip if a transcript already exists. Use a .en model only for English audio.",
    parameters: Type.Object({
      model: Type.Optional(
        Type.String({
          description: "Whisper model, e.g. small.en (English) or small (auto-detect).",
        }),
      ),
      language: Type.Optional(Type.String({ description: "Language code, e.g. en, es, ja." })),
    }),
    async execute(_callId, rawParams, signal, onUpdate) {
      const params = rawParams as { model?: string; language?: string };
      const project = await transcribeProject(projects, projectId, media, {
        model: params.model,
        language: params.language,
        signal: signal ?? undefined,
        onProgress: (chunk) =>
          onUpdate?.({ content: [{ type: "text", text: chunk }], details: {} }),
      });
      const transcript = await projects.getTranscript(projectId);
      const count = transcript?.words.length ?? 0;
      const last = transcript?.words.at(-1)?.end ?? project.source.duration ?? 0;
      return {
        content: [
          {
            type: "text" as const,
            text: `Transcribed ${count} words spanning ${last.toFixed(1)}s. transcript.json is ready - read it to choose soundbites.`,
          },
        ],
        details: { wordCount: count, durationSeconds: last },
      };
    },
  });

  const proposeCandidates = defineTool({
    name: "propose_candidates",
    label: "Propose candidates",
    description:
      "Seed the review queue with the initial ranked set of soundbite candidates. " +
      "DESTRUCTIVE: this REPLACES every candidate already in the queue, so use it ONLY for the first pass when the queue is empty (or when the user explicitly asks to start over). " +
      "To add more shorts to a queue that already has candidates, use add_candidates instead - never propose_candidates, or you will wipe the user's existing shorts. " +
      "Each candidate references a real word-id range from transcript.json. Propose only genuinely strong moments, best first.",
    parameters: Type.Object({
      candidates: Type.Array(ProposalSchema, { minItems: 1 }),
    }),
    async execute(_callId, rawParams) {
      const params = rawParams as { candidates: CandidateProposal[] };
      const project = await projects.replaceCandidates(projectId, params.candidates);
      return {
        content: [
          {
            type: "text" as const,
            text: `Seeded the review queue with ${project.candidates.length} candidate(s). Ask the user to review, trim, and approve them.`,
          },
        ],
        details: { count: project.candidates.length },
      };
    },
  });

  const addCandidates = defineTool({
    name: "add_candidates",
    label: "Add candidates",
    description:
      "Add one or more NEW soundbite candidates onto the EXISTING review queue, keeping every candidate already there. " +
      "ADDITIVE: this is the tool for the 'add one more short' flow and any time the queue is non-empty - it never removes or overwrites existing shorts; the merged list is re-sorted by rank. " +
      "Each candidate references a real word-id range from transcript.json. Do not duplicate a short already in the queue. Usually called with exactly one candidate.",
    parameters: Type.Object({
      candidates: Type.Array(ProposalSchema, { minItems: 1 }),
    }),
    async execute(_callId, rawParams) {
      const params = rawParams as { candidates: CandidateProposal[] };
      const before = (await projects.get(projectId)).candidates.length;
      const project = await projects.appendCandidates(projectId, params.candidates);
      const added = project.candidates.length - before;
      return {
        content: [
          {
            type: "text" as const,
            text: `Added ${added} candidate(s) to the review queue, which now holds ${project.candidates.length}. Ask the user to review, trim, and approve them.`,
          },
        ],
        details: { added, count: project.candidates.length },
      };
    },
  });

  const renderShortTool = defineTool({
    name: "render_short",
    label: "Render short",
    description:
      "Render one APPROVED candidate to a 1080x1920 captioned clip in the project's output folder. Never render a candidate the user has not approved.",
    parameters: Type.Object({
      candidateId: Type.String({ description: "Id of the approved candidate to render." }),
    }),
    async execute(_callId, rawParams, signal, onUpdate) {
      const params = rawParams as { candidateId: string };
      const project = await renderCandidate(projects, projectId, params.candidateId, media, {
        signal: signal ?? undefined,
        onProgress: (chunk) =>
          onUpdate?.({ content: [{ type: "text", text: chunk }], details: {} }),
      });
      const candidate = project.candidates.find((c) => c.id === params.candidateId);
      return {
        content: [
          {
            type: "text" as const,
            text: candidate?.renderedPath
              ? `Rendered "${candidate.title}" to ${candidate.renderedPath}.`
              : "Render finished.",
          },
        ],
        details: { renderedPath: candidate?.renderedPath },
      };
    },
  });

  return [probe, transcribe, proposeCandidates, addCandidates, renderShortTool];
}

export function videoToolNames(): string[] {
  return ["probe", "transcribe", "propose_candidates", "add_candidates", "render_short"];
}
