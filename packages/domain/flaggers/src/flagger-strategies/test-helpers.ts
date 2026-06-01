import { ExternalUserId, OrganizationId, ProjectId, SessionId, SimulationId, SpanId, TraceId } from "@domain/shared"
import type { TraceDetail } from "@domain/spans"

const ORG_ID = "a".repeat(24)
const PROJECT_ID = "b".repeat(24)
const TRACE_ID = "c".repeat(32)

type TraceMessage = TraceDetail["allMessages"][number]

export const makeTrace = (allMessages: readonly TraceMessage[]): TraceDetail => ({
  organizationId: OrganizationId(ORG_ID),
  projectId: ProjectId(PROJECT_ID),
  traceId: TraceId(TRACE_ID),
  spanCount: 1,
  errorCount: 0,
  startTime: new Date("2026-01-01T00:00:00.000Z"),
  endTime: new Date("2026-01-01T00:00:01.000Z"),
  durationNs: 1,
  timeToFirstTokenNs: 0,
  tokensInput: 0,
  tokensOutput: 0,
  tokensCacheRead: 0,
  tokensCacheCreate: 0,
  tokensReasoning: 0,
  tokensTotal: 0,
  costInputMicrocents: 0,
  costOutputMicrocents: 0,
  costTotalMicrocents: 0,
  sessionId: SessionId("session-1"),
  userId: ExternalUserId("user"),
  simulationId: SimulationId(""),
  tags: [],
  metadata: {},
  models: [],
  providers: [],
  serviceNames: [],
  rootSpanId: SpanId("r".repeat(16)),
  rootSpanName: "root",
  systemInstructions: [],
  inputMessages: [],
  outputMessages: [...allMessages],
  allMessages: [...allMessages],
})

export const system = (text: string): TraceMessage => ({
  role: "system",
  parts: [{ type: "text", content: text }],
})

export const user = (text: string): TraceMessage => ({
  role: "user",
  parts: [{ type: "text", content: text }],
})

export const assistant = (text: string): TraceMessage => ({
  role: "assistant",
  parts: [{ type: "text", content: text }],
})

let toolCallCounter = 0

export const assistantToolCall = (name: string, args: unknown): TraceMessage => ({
  role: "assistant",
  parts: [{ type: "tool_call", id: `tc_${++toolCallCounter}`, name, arguments: args }],
})

export const assistantToolCallWithText = (name: string, args: unknown, text: string): TraceMessage => ({
  role: "assistant",
  parts: [
    { type: "tool_call", id: `tc_${++toolCallCounter}`, name, arguments: args },
    { type: "text", content: text },
  ],
})

export const assistantReasoning = (reasoning: string): TraceMessage => ({
  role: "assistant",
  parts: [{ type: "reasoning", content: reasoning }],
})

export const assistantReasoningAndToolCall = (reasoning: string, name: string, args: unknown): TraceMessage => ({
  role: "assistant",
  parts: [
    { type: "reasoning", content: reasoning },
    { type: "tool_call", id: `tc_${++toolCallCounter}`, name, arguments: args },
  ],
})

export const assistantReasoningAndText = (reasoning: string, text: string): TraceMessage => ({
  role: "assistant",
  parts: [
    { type: "reasoning", content: reasoning },
    { type: "text", content: text },
  ],
})

export const tool = (id: string, response: unknown): TraceMessage => ({
  role: "tool",
  parts: [{ type: "tool_call_response", id, response }],
})
