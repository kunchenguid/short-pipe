import type { AgentEvent, AgentEventMeta, ChatMessage, ToolContent } from "@shared/events";

type PiTextContent = { type: "text"; text: string };
type PiImageContent = { type: "image"; data: string; mimeType: string };
type PiMessage = {
  role?: string;
  content?: unknown;
  timestamp?: number;
};

export function chatMessagesFromPiMessages(messages: unknown[]): ChatMessage[] {
  return messages.flatMap((message, index) => {
    const chatMessage = chatMessageFromPiMessage(message, index);
    return chatMessage ? [chatMessage] : [];
  });
}

export function chatMessageFromPiMessage(message: unknown, index: number): ChatMessage | null {
  if (!message || typeof message !== "object") return null;
  const piMessage = message as PiMessage;
  if (piMessage.role !== "user" && piMessage.role !== "assistant") return null;
  const timestamp = typeof piMessage.timestamp === "number" ? piMessage.timestamp : Date.now();
  return {
    id: `${piMessage.role}-${timestamp}-${index}`,
    role: piMessage.role,
    text: textFromPiContent(piMessage.content),
    createdAt: new Date(timestamp).toISOString(),
  };
}

export function textFromPiContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (isTextContent(part)) return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function toolContentFromResult(result: unknown): ToolContent[] {
  if (!result || typeof result !== "object") return [];
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  return content.flatMap<ToolContent>((part) => {
    if (isTextContent(part)) return [{ type: "text", text: part.text }];
    if (isImageContent(part)) {
      return [{ type: "image", data: part.data, mimeType: part.mimeType }];
    }
    return [];
  });
}

/**
 * Logbook-safe tool content: keeps text parts, but swaps image parts
 * (search_image's downloaded pixels) for a tiny placeholder so a creation's
 * on-disk logbook never balloons with base64. The model still sees the real
 * image - that lives in its session transcript, not the logbook.
 */
export function stripImageData(content: ToolContent[]): ToolContent[] {
  return content.map((part) =>
    part.type === "image" ? { type: "text", text: "[looked at a picture]" } : part,
  );
}

export function chatEventsFromPiEvent(event: unknown, meta: AgentEventMeta): AgentEvent[] {
  if (
    !event ||
    typeof event !== "object" ||
    typeof (event as { type?: unknown }).type !== "string"
  ) {
    return [];
  }
  const typed = event as Record<string, unknown>;
  const turnId = meta.turnId;
  switch (typed.type) {
    case "message_update": {
      const assistantMessageEvent = typed.assistantMessageEvent as
        | Record<string, unknown>
        | undefined;
      if (
        assistantMessageEvent?.type !== "text_delta" ||
        typeof assistantMessageEvent.delta !== "string"
      ) {
        return [];
      }
      return [{ type: "assistant_delta", ...meta, text: assistantMessageEvent.delta }];
    }
    case "tool_execution_start": {
      return [
        {
          type: "tool_start",
          ...meta,
          callId: String(typed.toolCallId),
          toolName: String(typed.toolName),
          args: typed.args,
        },
      ];
    }
    case "tool_execution_update": {
      return [
        {
          type: "tool_update",
          ...meta,
          callId: String(typed.toolCallId),
          content: toolContentFromResult(typed.partialResult),
        },
      ];
    }
    case "tool_execution_end": {
      return [
        {
          type: "tool_end",
          ...meta,
          callId: String(typed.toolCallId),
          isError: Boolean(typed.isError),
          content: toolContentFromResult(typed.result),
        },
      ];
    }
    case "compaction_start": {
      return [
        {
          type: "tool_start",
          ...meta,
          callId: `${turnId}:compaction`,
          toolName: "compact_context",
          args: { reason: typed.reason },
        },
      ];
    }
    case "compaction_end": {
      return [
        {
          type: "tool_end",
          ...meta,
          callId: `${turnId}:compaction`,
          isError: Boolean(typed.errorMessage),
          content: typed.errorMessage
            ? [{ type: "text", text: String(typed.errorMessage) }]
            : [{ type: "text", text: "Context compacted." }],
        },
      ];
    }
    case "auto_retry_start": {
      const attempt = Number(typed.attempt);
      return [
        {
          type: "tool_start",
          ...meta,
          callId: `${turnId}:retry:${attempt}`,
          toolName: "retry",
          args: {
            attempt: typed.attempt,
            maxAttempts: typed.maxAttempts,
            delayMs: typed.delayMs,
            errorMessage: typed.errorMessage,
          },
        },
      ];
    }
    case "auto_retry_end": {
      const attempt = Number(typed.attempt);
      return [
        {
          type: "tool_end",
          ...meta,
          callId: `${turnId}:retry:${attempt}`,
          isError: typed.success === false,
          content: typed.finalError
            ? [{ type: "text", text: String(typed.finalError) }]
            : [{ type: "text", text: "Retry finished." }],
        },
      ];
    }
    default:
      return [];
  }
}

function isTextContent(value: unknown): value is PiTextContent {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { type?: unknown }).type === "text" &&
      typeof (value as { text?: unknown }).text === "string",
  );
}

function isImageContent(value: unknown): value is PiImageContent {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { type?: unknown }).type === "image" &&
      typeof (value as { data?: unknown }).data === "string" &&
      typeof (value as { mimeType?: unknown }).mimeType === "string",
  );
}
