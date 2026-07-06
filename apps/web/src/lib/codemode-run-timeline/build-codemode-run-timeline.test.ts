import { describe, expect, it } from "vitest"
import {
  buildCodemodeRunTimeline,
  type CodemodeTimelineMessageInput,
  type CodemodeTimelineSpanInput,
  type CodemodeTimelineTraceInput,
} from "./build-codemode-run-timeline.ts"

const T0 = Date.parse("2026-07-02T10:00:00.000Z")
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString()

function span(
  overrides: Partial<CodemodeTimelineSpanInput> & Pick<CodemodeTimelineSpanInput, "spanId" | "traceId">,
): CodemodeTimelineSpanInput {
  return {
    parentSpanId: "",
    name: "",
    operation: "",
    toolName: "",
    startTime: iso(0),
    endTime: iso(0),
    statusCode: "ok",
    ...overrides,
  }
}

function trace(
  overrides: Partial<CodemodeTimelineTraceInput> & Pick<CodemodeTimelineTraceInput, "traceId">,
): CodemodeTimelineTraceInput {
  return {
    startTime: iso(0),
    endTime: iso(0),
    rootSpanName: "",
    errorCount: 0,
    ...overrides,
  }
}

const userMessage = (content: string): CodemodeTimelineMessageInput => ({
  role: "user",
  parts: [{ type: "text", content }],
})

const session = {
  sessionId: "sess-qa",
  startTime: iso(0),
  endTime: iso(30_000),
  traceIds: ["plan", "exec", "sub", "sum"],
}

// A qa-a8624440-shaped codemode turn: plan → codemode execution (with two inner
// tools) → sub-agent → summarize, one user message, spans carrying the Phase 0
// `latitude.codemode.*` attributes.
function codemodeFixture(): {
  traces: CodemodeTimelineTraceInput[]
  spans: CodemodeTimelineSpanInput[]
  messages: CodemodeTimelineMessageInput[]
} {
  const traces = [
    trace({ traceId: "sum", startTime: iso(26_000), endTime: iso(29_200), rootSpanName: "ai.streamText" }),
    trace({ traceId: "plan", startTime: iso(0), endTime: iso(18_300), rootSpanName: "ai.generateText" }),
    trace({ traceId: "exec", startTime: iso(18_300), endTime: iso(22_600), rootSpanName: "ai.toolCall codemode" }),
    trace({
      traceId: "sub",
      startTime: iso(19_000),
      endTime: iso(22_100),
      rootSpanName: "ai.streamText",
      metadata: { role: "weather-research-subagent" },
    }),
  ]

  const spans = [
    span({
      spanId: "plan-gen",
      traceId: "plan",
      name: "ai.generateText",
      operation: "invoke_agent",
      startTime: iso(0),
      endTime: iso(18_300),
      attrString: { "ai.telemetry.functionId": "codemode-plan" },
    }),
    span({
      spanId: "exec-codemode",
      traceId: "exec",
      name: "ai.toolCall codemode",
      operation: "execute_tool",
      toolName: "codemode",
      startTime: iso(18_300),
      endTime: iso(22_600),
    }),
    span({
      spanId: "inner-delegate",
      traceId: "exec",
      parentSpanId: "exec-codemode",
      name: "ai.toolCall delegateWeatherResearch",
      operation: "execute_tool",
      toolName: "delegateWeatherResearch",
      startTime: iso(18_400),
      endTime: iso(22_700),
      attrBool: { "latitude.codemode.inner_tool": true },
    }),
    span({
      spanId: "inner-format",
      traceId: "exec",
      parentSpanId: "exec-codemode",
      name: "ai.toolCall formatTravelBrief",
      operation: "execute_tool",
      toolName: "formatTravelBrief",
      startTime: iso(22_500),
      endTime: iso(22_500),
      attrBool: { "latitude.codemode.inner_tool": true },
    }),
    span({
      spanId: "sub-gen",
      traceId: "sub",
      name: "ai.streamText",
      operation: "invoke_agent",
      startTime: iso(19_000),
      endTime: iso(22_100),
      attrString: { "ai.telemetry.functionId": "research-subagent-turn" },
    }),
    span({
      spanId: "sum-gen",
      traceId: "sum",
      name: "ai.streamText",
      operation: "invoke_agent",
      startTime: iso(26_000),
      endTime: iso(29_200),
      attrString: { "ai.telemetry.functionId": "codemode-summary" },
    }),
  ]

  const messages: CodemodeTimelineMessageInput[] = [
    { role: "system", parts: [{ type: "text", content: "You are helpful." }] },
    userMessage("Compare Barcelona vs Paris for a weekend trip"),
    { role: "assistant", parts: [{ type: "text", content: "Barcelona edges it out." }] },
  ]

  return { traces, spans, messages }
}

describe("buildCodemodeRunTimeline", () => {
  it("builds one turn with plan → execute (inner tools) → sub-agent → summarize in chronological order", () => {
    const { traces, spans, messages } = codemodeFixture()
    const timeline = buildCodemodeRunTimeline({ session, traces, spans, messages })

    expect(timeline.turns).toHaveLength(1)
    const turn = timeline.turns[0]!
    expect(turn.turnIndex).toBe(0)
    expect(turn.label).toBe("Compare Barcelona vs Paris for a weekend trip")

    expect(turn.nodes.map((n) => n.kind)).toEqual(["plan", "execute", "subagent", "summarize"])

    const plan = turn.nodes[0]!
    expect(plan.confidence).toBe("high")
    expect(plan.label).toBe("Plan")
    expect(plan.spanId).toBeNull()
    expect(plan.traceId).toBe("plan")
    expect(plan.durationMs).toBe(18_300)

    const execute = turn.nodes[1]!
    expect(execute.label).toBe("Codemode execution")
    expect(execute.children.map((c) => c.label)).toEqual(["delegateWeatherResearch", "formatTravelBrief"])
    expect(execute.children.map((c) => c.kind)).toEqual(["innerTool", "innerTool"])
    // formatTravelBrief has a zero-length window
    expect(execute.children[1]!.durationMs).toBe(0)
    expect(execute.children[0]!.spanId).toBe("inner-delegate")

    const subagent = turn.nodes[2]!
    expect(subagent.label).toBe("Sub-agent · weather-research-subagent")

    expect(turn.nodes[3]!.label).toBe("Summarize")
  })

  it("marks failed spans/traces with isError", () => {
    const { traces, spans, messages } = codemodeFixture()
    const failingSpans = spans.map((s) => (s.spanId === "inner-delegate" ? { ...s, statusCode: "error" } : s))
    const failingTraces = traces.map((t) => (t.traceId === "exec" ? { ...t, errorCount: 1 } : t))
    const timeline = buildCodemodeRunTimeline({ session, traces: failingTraces, spans: failingSpans, messages })

    const execute = timeline.turns[0]!.nodes.find((n) => n.kind === "execute")!
    expect(execute.isError).toBe(true)
    expect(execute.children.find((c) => c.spanId === "inner-delegate")!.isError).toBe(true)
  })

  it("groups by latitude.codemode.turn_id when present (authoritative over time windows)", () => {
    const spans: CodemodeTimelineSpanInput[] = [
      span({
        spanId: "p1",
        traceId: "t1",
        name: "ai.generateText",
        operation: "invoke_agent",
        startTime: iso(0),
        endTime: iso(5_000),
        attrString: { "ai.telemetry.functionId": "codemode-plan", "latitude.codemode.turn_id": "sess:0" },
      }),
      span({
        spanId: "p2",
        traceId: "t2",
        name: "ai.generateText",
        operation: "invoke_agent",
        startTime: iso(6_000),
        endTime: iso(9_000),
        attrString: { "ai.telemetry.functionId": "codemode-plan", "latitude.codemode.turn_id": "sess:1" },
      }),
    ]
    const traces = [
      trace({ traceId: "t1", startTime: iso(0), endTime: iso(5_000), rootSpanName: "ai.generateText" }),
      trace({ traceId: "t2", startTime: iso(6_000), endTime: iso(9_000), rootSpanName: "ai.generateText" }),
    ]
    const messages = [userMessage("first question"), userMessage("second question")]

    const timeline = buildCodemodeRunTimeline({ session, traces, spans, messages })

    expect(timeline.turns).toHaveLength(2)
    expect(timeline.turns[0]!.turnId).toBe("sess:0")
    expect(timeline.turns[0]!.label).toBe("first question")
    expect(timeline.turns[1]!.turnId).toBe("sess:1")
    expect(timeline.turns[1]!.label).toBe("second question")
  })

  it("splits by plan boundaries when turn_id is identical but the session has multiple user messages", () => {
    const spans: CodemodeTimelineSpanInput[] = [
      span({
        spanId: "p1",
        traceId: "t1",
        name: "ai.generateText",
        operation: "invoke_agent",
        startTime: iso(0),
        endTime: iso(5_000),
        attrString: { "ai.telemetry.functionId": "codemode-plan", "latitude.codemode.turn_id": "sess:0" },
      }),
      span({
        spanId: "p2",
        traceId: "t2",
        name: "ai.generateText",
        operation: "invoke_agent",
        startTime: iso(20_000),
        endTime: iso(25_000),
        attrString: { "ai.telemetry.functionId": "codemode-plan", "latitude.codemode.turn_id": "sess:0" },
      }),
    ]
    const traces = [
      trace({ traceId: "t1", startTime: iso(0), endTime: iso(5_000), rootSpanName: "ai.generateText" }),
      trace({ traceId: "t2", startTime: iso(20_000), endTime: iso(25_000), rootSpanName: "ai.generateText" }),
    ]
    const messages = [userMessage("first question"), userMessage("second question")]

    const timeline = buildCodemodeRunTimeline({ session, traces, spans, messages })

    expect(timeline.turns).toHaveLength(2)
    expect(timeline.turns[0]!.label).toBe("first question")
    expect(timeline.turns[1]!.label).toBe("second question")
  })

  it("classifies ai.toolCall codemode as execute even when phase=plan is inherited from the turn tracer", () => {
    const { traces, spans, messages } = codemodeFixture()
    const spansWithInheritedPlan = spans.map((s) =>
      s.spanId === "exec-codemode"
        ? { ...s, attrString: { ...(s.attrString ?? {}), "latitude.codemode.phase": "plan" } }
        : s,
    )
    const timeline = buildCodemodeRunTimeline({ session, traces, spans: spansWithInheritedPlan, messages })
    const kinds = timeline.turns[0]!.nodes.map((n) => n.kind)
    expect(kinds).toEqual(["plan", "execute", "subagent", "summarize"])
  })

  it("degrades to name/operation heuristics with low confidence when no codemode attributes exist (legacy data)", () => {
    // No attrString/attrBool — mirrors the current session span collection (SpanRecord has no attributes).
    const traces = [
      trace({ traceId: "plan", startTime: iso(0), endTime: iso(10_000), rootSpanName: "ai.generateText" }),
      trace({ traceId: "exec", startTime: iso(10_000), endTime: iso(14_000), rootSpanName: "ai.toolCall codemode" }),
      trace({ traceId: "sum", startTime: iso(14_000), endTime: iso(18_000), rootSpanName: "ai.streamText" }),
    ]
    const spans = [
      span({
        spanId: "s-plan",
        traceId: "plan",
        name: "ai.generateText",
        operation: "invoke_agent",
        startTime: iso(0),
        endTime: iso(10_000),
      }),
      span({
        spanId: "s-exec",
        traceId: "exec",
        name: "ai.toolCall codemode",
        operation: "execute_tool",
        toolName: "codemode",
        startTime: iso(10_000),
        endTime: iso(14_000),
      }),
      span({
        spanId: "s-inner",
        traceId: "exec",
        parentSpanId: "s-exec",
        name: "ai.toolCall lookupCity",
        operation: "execute_tool",
        toolName: "lookupCity",
        startTime: iso(10_500),
        endTime: iso(11_000),
      }),
      span({
        spanId: "s-sum",
        traceId: "sum",
        name: "ai.streamText",
        operation: "invoke_agent",
        startTime: iso(14_000),
        endTime: iso(18_000),
      }),
    ]
    const messages = [userMessage("hello there")]

    const timeline = buildCodemodeRunTimeline({ session, traces, spans, messages })

    expect(timeline.turns).toHaveLength(1)
    const turn = timeline.turns[0]!
    expect(turn.nodes.map((n) => n.kind)).toEqual(["plan", "execute", "summarize"])
    // execute detection from operation + toolName is high confidence even without attributes
    expect(turn.nodes.find((n) => n.kind === "execute")!.confidence).toBe("high")
    // plan/summarize inferred from name only → low confidence
    expect(turn.nodes.find((n) => n.kind === "plan")!.confidence).toBe("low")
    // inner tool nested under execute via parent tool-call fallback
    expect(turn.nodes.find((n) => n.kind === "execute")!.children.map((c) => c.label)).toEqual(["lookupCity"])
  })

  it("does not label codemode-turn streamText traces as codemode execution", () => {
    const traces = [
      trace({
        traceId: "agent-turn",
        startTime: iso(0),
        endTime: iso(900),
        rootSpanName: "ai.streamText",
      }),
    ]
    const spans = [
      span({
        spanId: "root",
        traceId: "agent-turn",
        name: "ai.streamText",
        operation: "invoke_agent",
        startTime: iso(0),
        endTime: iso(900),
        attrString: { "ai.telemetry.functionId": "codemode-turn" },
      }),
      span({
        spanId: "stream",
        traceId: "agent-turn",
        parentSpanId: "root",
        name: "ai.streamText.doStream",
        operation: "chat",
        startTime: iso(0),
        endTime: iso(900),
        attrString: { "ai.telemetry.functionId": "codemode-turn" },
      }),
    ]
    const timeline = buildCodemodeRunTimeline({ session, traces, spans, messages: [userMessage("hello")] })
    const node = timeline.turns[0]!.nodes[0]!
    expect(node.kind).toBe("agent")
    expect(node.label).toBe("Agent response")
    expect(node.confidence).toBe("high")
  })

  it("labels a single inner-tool trace by tool name instead of unlabeled", () => {
    const traces = [
      trace({
        traceId: "inner-only",
        startTime: iso(10_000),
        endTime: iso(10_001),
        rootSpanName: "ai.toolCall formatTravelBrief",
      }),
    ]
    const spans = [
      span({
        spanId: "inner-format",
        traceId: "inner-only",
        name: "ai.toolCall formatTravelBrief",
        operation: "execute_tool",
        toolName: "formatTravelBrief",
        startTime: iso(10_000),
        endTime: iso(10_001),
        attrBool: { "latitude.codemode.inner_tool": true },
      }),
    ]
    const timeline = buildCodemodeRunTimeline({ session, traces, spans, messages: [userMessage("hello")] })
    const node = timeline.turns[0]!.nodes[0]!
    expect(node.kind).toBe("innerTool")
    expect(node.label).toBe("formatTravelBrief")
    expect(node.spanId).toBe("inner-format")
  })

  it("nests inner-tool spans under sub-agent traces", () => {
    const traces = [
      trace({
        traceId: "sub",
        startTime: iso(19_000),
        endTime: iso(22_100),
        rootSpanName: "ai.streamText",
        metadata: { role: "weather-research-subagent" },
      }),
    ]
    const spans = [
      span({
        spanId: "sub-root",
        traceId: "sub",
        name: "ai.streamText",
        operation: "invoke_agent",
        startTime: iso(19_000),
        endTime: iso(22_100),
        attrString: { "ai.telemetry.functionId": "research-subagent-turn" },
      }),
      span({
        spanId: "sub-tool",
        traceId: "sub",
        parentSpanId: "sub-root",
        name: "ai.toolCall getWeatherDetail",
        operation: "execute_tool",
        toolName: "getWeatherDetail",
        startTime: iso(19_500),
        endTime: iso(20_000),
        attrBool: { "latitude.codemode.inner_tool": true },
      }),
    ]
    const timeline = buildCodemodeRunTimeline({ session, traces, spans, messages: [userMessage("hello")] })
    const node = timeline.turns[0]!.nodes[0]!
    expect(node.kind).toBe("subagent")
    expect(node.children.map((child) => child.label)).toEqual(["getWeatherDetail"])
  })

  it("falls back to a single turn keyed by session id when there is no turn metadata or timestamps", () => {
    const traces = [trace({ traceId: "exec", rootSpanName: "ai.toolCall codemode", endTime: iso(1_000) })]
    const spans = [
      span({
        spanId: "x",
        traceId: "exec",
        name: "ai.toolCall codemode",
        operation: "execute_tool",
        toolName: "codemode",
        endTime: iso(1_000),
      }),
    ]
    const timeline = buildCodemodeRunTimeline({ session, traces, spans, messages: [] })
    expect(timeline.turns).toHaveLength(1)
    expect(timeline.turns[0]!.turnId).toBe("sess-qa:0")
    expect(timeline.turns[0]!.label).toBe("Turn 1")
  })
})
