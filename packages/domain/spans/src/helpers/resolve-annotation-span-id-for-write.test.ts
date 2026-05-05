import { OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import type { SpanMessagesData } from "../ports/span-repository.ts"
import { stubListSpan } from "../testing/stub-list-span.ts"
import {
  annotationAnchorTargetsToolPart,
  resolveAnnotationSpanIdForWrite,
} from "./resolve-annotation-span-id-for-write.ts"

const orgId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const traceId = TraceId("t".repeat(32))
const sessionId = SessionId("s".repeat(24))

function textMsg(role: "user" | "assistant", content: string): GenAIMessage {
  return { role, parts: [{ type: "text", content }] }
}

function makeSpanMessages(
  spanId: string,
  output: GenAIMessage,
  inputs: readonly GenAIMessage[] = [],
  toolCallId = "",
): SpanMessagesData {
  return {
    spanId: SpanId(spanId),
    operation: "execute_tool",
    toolCallId,
    inputMessages: inputs,
    outputMessages: [output],
  }
}

const chatSpan = stubListSpan({
  organizationId: orgId,
  projectId,
  traceId,
  sessionId,
  spanId: SpanId("c".repeat(16)),
  operation: "chat",
  startTime: new Date("2026-01-02T00:00:00.000Z"),
  endTime: new Date("2026-01-02T00:01:00.000Z"),
})

describe("annotationAnchorTargetsToolPart", () => {
  it("is false for text selections", () => {
    const messages: GenAIMessage[] = [textMsg("assistant", "Hello")]
    expect(annotationAnchorTargetsToolPart(messages, { messageIndex: 0, partIndex: 0 })).toBe(false)
  })

  it("is true for tool_call_response anchor", () => {
    const messages: GenAIMessage[] = [
      {
        role: "assistant",
        parts: [
          { type: "tool_call", name: "Read", id: "tc1", arguments: {} },
          { type: "tool_call_response", id: "tc1", response: {} },
        ],
      },
    ]
    expect(annotationAnchorTargetsToolPart(messages, { messageIndex: 0, partIndex: 1 })).toBe(true)
  })
})

describe("resolveAnnotationSpanIdForWrite", () => {
  it("returns execute_tool span when anchor selects tool_call_response with matching id", () => {
    const toolCallId = "call-read-1"
    const assistantWithTool: GenAIMessage = {
      role: "assistant",
      parts: [
        { type: "tool_call", name: "Read", id: toolCallId, arguments: {} },
        {
          type: "tool_call_response",
          id: toolCallId,
          response: { error: "failed" },
        },
      ],
    }
    const messages: GenAIMessage[] = [textMsg("user", "open file"), assistantWithTool]
    const toolSpanId = "t".repeat(16)
    const spanMessages = [makeSpanMessages(toolSpanId, textMsg("assistant", "tool output"), [], toolCallId)]

    const resolved = resolveAnnotationSpanIdForWrite({
      allMessages: messages,
      spanMessages,
      llmSpans: [chatSpan],
      anchor: { messageIndex: 1, partIndex: 1 },
    })

    expect(resolved).toEqual(SpanId(toolSpanId))
  })

  it("returns execute_tool span when anchor selects tool_call part", () => {
    const toolCallId = "tc-99"
    const assistantWithTool: GenAIMessage = {
      role: "assistant",
      parts: [{ type: "tool_call", name: "Bash", id: toolCallId, arguments: { cmd: "ls" } }],
    }
    const messages: GenAIMessage[] = [assistantWithTool]
    const toolSpanId = "u".repeat(16)
    const spanMessages = [makeSpanMessages(toolSpanId, textMsg("assistant", "out"), [], toolCallId)]

    const resolved = resolveAnnotationSpanIdForWrite({
      allMessages: messages,
      spanMessages,
      llmSpans: [chatSpan],
      anchor: { messageIndex: 0, partIndex: 0 },
    })

    expect(resolved).toEqual(SpanId(toolSpanId))
  })

  it("falls back to last LLM completion when anchor is plain text", () => {
    const messages: GenAIMessage[] = [textMsg("assistant", "Hello")]
    const laterChat = stubListSpan({
      organizationId: orgId,
      projectId,
      traceId,
      sessionId,
      spanId: SpanId("d".repeat(16)),
      operation: "chat",
      startTime: new Date("2026-01-02T00:00:30.000Z"),
      endTime: new Date("2026-01-02T00:02:00.000Z"),
    })

    const resolved = resolveAnnotationSpanIdForWrite({
      allMessages: messages,
      spanMessages: [],
      llmSpans: [chatSpan, laterChat],
      anchor: { messageIndex: 0, partIndex: 0 },
    })

    expect(resolved).toEqual(laterChat.spanId)
  })

  it("falls back to last LLM completion when anchor is omitted", () => {
    const resolved = resolveAnnotationSpanIdForWrite({
      allMessages: [],
      spanMessages: [],
      llmSpans: [chatSpan],
      anchor: undefined,
    })

    expect(resolved).toEqual(chatSpan.spanId)
  })
})
