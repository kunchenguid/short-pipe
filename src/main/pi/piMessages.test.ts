import { describe, expect, it } from "vitest";
import {
  chatEventsFromPiEvent,
  chatMessagesFromPiMessages,
  stripImageData,
  toolContentFromResult,
} from "./piMessages";

describe("chatMessagesFromPiMessages", () => {
  it("converts Pi user and assistant messages into renderer chat messages", () => {
    const messages = chatMessagesFromPiMessages([
      { role: "user", content: "Find me some shorts", timestamp: 1 },
      {
        role: "assistant",
        content: [
          { type: "text", text: "I found a few." },
          { type: "thinking", thinking: "hidden" },
        ],
        timestamp: 2,
      },
      {
        role: "toolResult",
        toolCallId: "1",
        toolName: "read",
        content: [],
        isError: false,
        timestamp: 3,
      },
    ]);

    expect(messages).toEqual([
      {
        id: "user-1-0",
        role: "user",
        text: "Find me some shorts",
        createdAt: new Date(1).toISOString(),
      },
      {
        id: "assistant-2-1",
        role: "assistant",
        text: "I found a few.",
        createdAt: new Date(2).toISOString(),
      },
    ]);
  });
});

describe("chatEventsFromPiEvent", () => {
  const meta = {
    turnId: "turn-1",
    projectId: "project-1",
    projectTitle: "Layoffs talk",
  };

  it("maps assistant text deltas with project attribution", () => {
    expect(
      chatEventsFromPiEvent(
        {
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "Hi" },
        },
        meta,
      ),
    ).toEqual([
      {
        type: "assistant_delta",
        turnId: "turn-1",
        projectId: "project-1",
        projectTitle: "Layoffs talk",
        text: "Hi",
      },
    ]);
  });

  it("maps tool lifecycle events", () => {
    expect(
      chatEventsFromPiEvent(
        {
          type: "tool_execution_start",
          toolCallId: "call-1",
          toolName: "transcribe",
          args: { path: "talk.mp4" },
        },
        meta,
      ),
    ).toEqual([
      {
        type: "tool_start",
        turnId: "turn-1",
        projectId: "project-1",
        projectTitle: "Layoffs talk",
        callId: "call-1",
        toolName: "transcribe",
        args: { path: "talk.mp4" },
      },
    ]);

    expect(
      chatEventsFromPiEvent(
        {
          type: "tool_execution_end",
          toolCallId: "call-1",
          toolName: "transcribe",
          result: { content: [{ type: "text", text: "done" }] },
          isError: false,
        },
        meta,
      ),
    ).toEqual([
      {
        type: "tool_end",
        turnId: "turn-1",
        projectId: "project-1",
        projectTitle: "Layoffs talk",
        callId: "call-1",
        isError: false,
        content: [{ type: "text", text: "done" }],
      },
    ]);
  });

  it("maps retry and compaction events into visible tool rows", () => {
    expect(
      chatEventsFromPiEvent(
        { type: "compaction_start", reason: "threshold" },
        { turnId: "turn-1", projectId: "project-1" },
      ),
    ).toEqual([
      {
        type: "tool_start",
        turnId: "turn-1",
        projectId: "project-1",
        callId: "turn-1:compaction",
        toolName: "compact_context",
        args: { reason: "threshold" },
      },
    ]);

    expect(
      chatEventsFromPiEvent(
        {
          type: "auto_retry_start",
          attempt: 1,
          maxAttempts: 3,
          delayMs: 100,
          errorMessage: "busy",
        },
        { turnId: "turn-1", projectId: "project-1" },
      ),
    ).toEqual([
      {
        type: "tool_start",
        turnId: "turn-1",
        projectId: "project-1",
        callId: "turn-1:retry:1",
        toolName: "retry",
        args: { attempt: 1, maxAttempts: 3, delayMs: 100, errorMessage: "busy" },
      },
    ]);
  });
});

describe("toolContentFromResult", () => {
  it("normalizes text and image tool content", () => {
    expect(
      toolContentFromResult({
        content: [
          { type: "text", text: "hello" },
          { type: "image", data: "base64", mimeType: "image/png" },
          { type: "thinking", thinking: "skip" },
        ],
      }),
    ).toEqual([
      { type: "text", text: "hello" },
      { type: "image", data: "base64", mimeType: "image/png" },
    ]);
  });
});

describe("stripImageData", () => {
  it("replaces image parts with a placeholder so logs stay free of base64", () => {
    expect(
      stripImageData([
        { type: "text", text: "Here is a frame." },
        { type: "image", data: "AAAAbase64AAAA", mimeType: "image/png" },
      ]),
    ).toEqual([
      { type: "text", text: "Here is a frame." },
      { type: "text", text: "[looked at a picture]" },
    ]);
  });

  it("leaves text-only content untouched", () => {
    const content = [{ type: "text" as const, text: "just words" }];
    expect(stripImageData(content)).toEqual(content);
  });
});
