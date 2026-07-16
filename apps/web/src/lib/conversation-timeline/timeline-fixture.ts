import type { GenAIMessage } from "rosetta-ai"
import type {
  BuildConversationTimelineInput,
  TimelineSpanInput,
  TimelineTraceInput,
} from "./build-conversation-timeline.ts"

export const FIXTURE_T0 = 1_700_000_000_000
const at = (ms: number) => FIXTURE_T0 + ms

export const fixtureMessage = (role: string, ...parts: object[]) => ({ role, parts }) as GenAIMessage
export const fixtureText = (content: string) => ({ type: "text", content })
export const fixtureToolCall = (id: string, name = "search") => ({ type: "tool_call", id, name, arguments: {} })
export const fixtureToolResponse = (id: string) => ({ type: "tool_call_response", id, response: "ok" })

export const fixtureSpan = (
  overrides: Partial<TimelineSpanInput> & { spanId: string; traceId: string },
): TimelineSpanInput => ({
  parentSpanId: "",
  startMs: at(0),
  endMs: at(1_000),
  ttftMs: 0,
  isStreaming: false,
  isError: false,
  name: overrides.spanId,
  operation: "",
  statusMessage: "",
  ...overrides,
})

const TRACE_1: TimelineTraceInput = { traceId: "t1", startMs: at(0), endMs: at(20_000), label: "Trace 1" }
const TRACE_2: TimelineTraceInput = { traceId: "t2", startMs: at(140_000), endMs: at(150_000), label: "Trace 2" }

// Two-turn session: turn 1 streams an answer with a tool loop, turn 2 is a
// non-streaming answer after a 2m idle gap, plus an unrelated error span.
export const TIMELINE_FIXTURE: BuildConversationTimelineInput = {
  messages: [
    fixtureMessage("system", fixtureText("be helpful")),
    fixtureMessage("user", fixtureText("question one")),
    fixtureMessage("assistant", fixtureText("Let me check."), fixtureToolCall("call_1")),
    fixtureMessage("tool", fixtureToolResponse("call_1")),
    fixtureMessage("assistant", fixtureText("Result is 42.")),
    fixtureMessage("user", fixtureText("question two")),
    fixtureMessage("assistant", fixtureText("Final.")),
  ],
  spans: [
    fixtureSpan({
      spanId: "s1",
      traceId: "t1",
      startMs: at(500),
      endMs: at(10_000),
      ttftMs: 1_000,
      isStreaming: true,
      operation: "chat",
    }),
    fixtureSpan({
      spanId: "s2",
      traceId: "t1",
      startMs: at(10_000),
      endMs: at(14_000),
      operation: "execute_tool",
      name: "search",
    }),
    fixtureSpan({
      spanId: "s3",
      traceId: "t1",
      startMs: at(14_000),
      endMs: at(20_000),
      ttftMs: 500,
      isStreaming: true,
      operation: "chat",
    }),
    fixtureSpan({
      spanId: "s4",
      traceId: "t2",
      startMs: at(140_200),
      endMs: at(150_000),
      ttftMs: 1_000,
      operation: "chat",
    }),
    fixtureSpan({
      spanId: "s5",
      traceId: "t2",
      startMs: at(141_000),
      endMs: at(142_000),
      isError: true,
      name: "guardrail",
    }),
  ],
  messageSpanMap: { 2: "s1", 4: "s3", 6: "s4" },
  toolCallSpanMap: { call_1: "s2" },
  traces: [TRACE_1, TRACE_2],
  annotations: [
    {
      id: "ann1",
      messageIndex: 4,
      spanId: null,
      passed: false,
      feedback: "wrong",
      flaggerSlug: null,
      annotatorName: "Carlos",
    },
    {
      id: "ann2",
      messageIndex: null,
      spanId: null,
      passed: true,
      feedback: "overall fine",
      flaggerSlug: null,
      annotatorName: null,
    },
  ],
  moments: [
    { id: "label1", messageIndex: 6, kind: "frustration", summary: "User repeated the request", confidence: 0.87 },
  ],
  subagents: [],
}
