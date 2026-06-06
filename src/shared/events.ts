import type { Project, ProjectSummary } from "./project";

/**
 * Content emitted by a tool call, streamed to the UI. Mirrors the pi tool
 * result content shape.
 */
export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

/** A persisted chat message, used when loading conversation history. */
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

/** Identifies which project + turn an agent event belongs to. */
export type AgentEventMeta = {
  projectId: string;
  turnId: string;
  projectTitle?: string;
};

/** Streaming output from a single agent session, one project at a time. */
export type AgentEvent =
  | ({ type: "turn_start" } & AgentEventMeta)
  | ({ type: "assistant_delta"; text: string } & AgentEventMeta)
  | ({ type: "tool_start"; callId: string; toolName: string; args: unknown } & AgentEventMeta)
  | ({ type: "tool_update"; callId: string; content: ToolContent[] } & AgentEventMeta)
  | ({
      type: "tool_end";
      callId: string;
      isError: boolean;
      content: ToolContent[];
    } & AgentEventMeta)
  | ({
      type: "turn_end";
      status: "completed" | "cancelled" | "failed";
      error?: string;
    } & AgentEventMeta);

/**
 * Project lifecycle events. The project store emits `project_updated` after any
 * mutation - whether it came from a UI IPC call or from one of the agent's
 * tools - so the renderer and any agent-driven state stay convergent. Render
 * jobs additionally stream `render_progress` percentages before the final
 * project mutation marks the candidate rendered.
 */
export type ProjectEvent =
  | { type: "project_updated"; project: Project }
  | { type: "projects_listed"; projects: ProjectSummary[] }
  | { type: "render_progress"; projectId: string; candidateId: string; percent: number };

/** Everything that flows over the one-way `sp:event` channel. */
export type AppEvent = AgentEvent | ProjectEvent;
