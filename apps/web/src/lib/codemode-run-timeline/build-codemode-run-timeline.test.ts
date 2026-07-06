import { describe, expect, it } from "vitest"
import {
  buildCodemodeRunTimeline,
  type CodemodeRunNode,
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
  traceIds: ["plan", "delegate", "sub", "format", "sum"],
}

const kinds = (nodes: readonly CodemodeRunNode[]) => nodes.map((n) => n.kind)
const labels = (nodes: readonly CodemodeRunNode[]) => nodes.map((n) => n.label)

// A realistic codemode orchestration turn. Unlike an idealized single trace, real
// ingest splits each execution context into its OWN root trace with NO cross-trace
// parentSpanId: the plan trace holds the `ai.toolCall codemode` node; each sandbox
// inner tool is a separate root trace (`inner_tool`); the sub-agent is a separate
// trace linked only by `run_id`; the summary is a separate trace.
function realCodemodeTurn(): {
  traces: CodemodeTimelineTraceInput[]
  spans: CodemodeTimelineSpanInput[]
  messages: CodemodeTimelineMessageInput[]
} {
  const RUN = "run-Yfwe"
  const traces = [
    trace({ traceId: "plan", startTime: iso(0), endTime: iso(18_300), rootSpanName: "ai.generateText" }),
    trace({ traceId: "delegate", startTime: iso(2_500), endTime: iso(16_800), rootSpanName: "ai.toolCall" }),
    trace({
      traceId: "sub",
      startTime: iso(3_000),
      endTime: iso(16_000),
      rootSpanName: "ai.streamText",
      metadata: { role: "weather-research-subagent" },
    }),
    trace({ traceId: "format", startTime: iso(16_500), endTime: iso(16_600), rootSpanName: "ai.toolCall" }),
    trace({ traceId: "sum", startTime: iso(26_000), endTime: iso(29_200), rootSpanName: "ai.streamText" }),
  ]

  const spans = [
    // plan trace: generateText (plan) → doGenerate (noise) → codemode execute span
    span({
      spanId: "plan-root",
      traceId: "plan",
      name: "ai.generateText",
      operation: "invoke_agent",
      startTime: iso(0),
      endTime: iso(18_300),
      attrString: { "ai.telemetry.functionId": "codemode-plan" },
    }),
    span({
      spanId: "plan-chat",
      traceId: "plan",
      parentSpanId: "plan-root",
      name: "ai.generateText.doGenerate",
      operation: "chat",
      startTime: iso(100),
      endTime: iso(2_000),
    }),
    span({
      spanId: "code-exec",
      traceId: "plan",
      parentSpanId: "plan-root",
      name: "ai.toolCall",
      operation: "execute_tool",
      toolName: "codemode",
      startTime: iso(2_000),
      endTime: iso(17_000),
    }),
    // delegate: separate root trace, inner sandbox tool, carries run_id (spawned the sub-agent)
    span({
      spanId: "delegate-root",
      traceId: "delegate",
      name: "ai.toolCall delegateWeatherResearch",
      operation: "execute_tool",
      toolName: "delegateWeatherResearch",
      startTime: iso(2_500),
      endTime: iso(16_800),
      attrBool: { "latitude.codemode.inner_tool": true },
      attrString: {
        "latitude.agent_tool.run_id": RUN,
        "latitude.agent_tool.parent_tool_call_id": "codemode-inner-delegateWeatherResearch-a7f1",
      },
    }),
    // sub-agent: separate root trace, linked ONLY by run_id; wrapper span is collapsed
    span({
      spanId: "sub-root",
      traceId: "sub",
      name: "ai.streamText",
      operation: "invoke_agent",
      startTime: iso(3_000),
      endTime: iso(16_000),
      attrString: { "ai.telemetry.functionId": "research-subagent-turn", "latitude.agent_tool.run_id": RUN },
    }),
    span({
      spanId: "sub-wrapper",
      traceId: "sub",
      parentSpanId: "sub-root",
      name: "ai.toolCall",
      operation: "execute_tool",
      startTime: iso(3_200),
      endTime: iso(4_000),
      attrString: { "latitude.agent_tool.run_id": RUN },
    }),
    span({
      spanId: "sub-tool",
      traceId: "sub",
      parentSpanId: "sub-wrapper",
      name: "ai.toolCall getWeatherDetail",
      operation: "execute_tool",
      toolName: "getWeatherDetail",
      startTime: iso(3_300),
      endTime: iso(3_800),
      attrBool: { "latitude.codemode.inner_tool": true },
      attrString: { "latitude.agent_tool.run_id": RUN },
    }),
    // format: separate root trace, inner sandbox tool (no sub-agent)
    span({
      spanId: "format-root",
      traceId: "format",
      name: "ai.toolCall formatTravelBrief",
      operation: "execute_tool",
      toolName: "formatTravelBrief",
      startTime: iso(16_500),
      endTime: iso(16_600),
      attrBool: { "latitude.codemode.inner_tool": true },
    }),
    // summary: separate root trace
    span({
      spanId: "sum-root",
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
  it("stitches disconnected traces into one graph via run_id + inner_tool containment", () => {
    const { traces, spans, messages } = realCodemodeTurn()
    const timeline = buildCodemodeRunTimeline({ session, traces, spans, messages })

    expect(timeline.turns).toHaveLength(1)
    const turn = timeline.turns[0]!
    expect(turn.label).toBe("Compare Barcelona vs Paris for a weekend trip")

    // Top level: plan and summarize (summary joins the same turn — not a turn entry).
    expect(kinds(turn.nodes)).toEqual(["plan", "summarize"])

    const plan = turn.nodes[0]!
    expect(kinds(plan.children)).toEqual(["execute"])

    const execute = plan.children[0]!
    expect(execute.label).toBe("Codemode execution")
    // Inner-tool traces attach under the code node by time containment, in start order.
    expect(labels(execute.children)).toEqual(["delegateWeatherResearch", "formatTravelBrief"])
    expect(kinds(execute.children)).toEqual(["innerTool", "innerTool"])

    // Sub-agent nests under the delegate tool (run_id edge), and its wrapper span collapses.
    const delegate = execute.children[0]!
    expect(kinds(delegate.children)).toEqual(["subagent"])
    const subagent = delegate.children[0]!
    expect(subagent.label).toBe("Sub-agent · weather-research-subagent")
    expect(labels(subagent.children)).toEqual(["getWeatherDetail"])
  })

  it("navigates every node to its own span", () => {
    const { traces, spans, messages } = realCodemodeTurn()
    const timeline = buildCodemodeRunTimeline({ session, traces, spans, messages })
    const execute = timeline.turns[0]!.nodes[0]!.children[0]!
    expect(execute.spanId).toBe("code-exec")
    expect(execute.traceId).toBe("plan")
    const delegate = execute.children[0]!
    expect(delegate.spanId).toBe("delegate-root")
    expect(delegate.traceId).toBe("delegate")
  })

  it("propagates span errors onto the matching node", () => {
    const { traces, spans, messages } = realCodemodeTurn()
    const failing = spans.map((s) => (s.spanId === "delegate-root" ? { ...s, statusCode: "error" } : s))
    const timeline = buildCodemodeRunTimeline({ session, traces, spans: failing, messages })
    const delegate = timeline.turns[0]!.nodes[0]!.children[0]!.children[0]!
    expect(delegate.spanId).toBe("delegate-root")
    expect(delegate.isError).toBe(true)
  })

  it("splits turns at each main-agent entry (greeting turn + orchestration turn)", () => {
    // Reproduces the original bug: a simple 'codemode-turn' reply followed by an
    // orchestration (plan+summary) must render as TWO turns, not one.
    const traces = [
      trace({ traceId: "greet", startTime: iso(0), endTime: iso(900), rootSpanName: "ai.streamText" }),
      trace({ traceId: "plan", startTime: iso(5_000), endTime: iso(8_000), rootSpanName: "ai.generateText" }),
      trace({ traceId: "sum", startTime: iso(9_000), endTime: iso(11_000), rootSpanName: "ai.streamText" }),
    ]
    const spans = [
      span({
        spanId: "greet-root",
        traceId: "greet",
        name: "ai.streamText",
        operation: "invoke_agent",
        startTime: iso(0),
        endTime: iso(900),
        attrString: { "ai.telemetry.functionId": "codemode-turn" },
      }),
      span({
        spanId: "plan-root",
        traceId: "plan",
        name: "ai.generateText",
        operation: "invoke_agent",
        startTime: iso(5_000),
        endTime: iso(8_000),
        attrString: { "ai.telemetry.functionId": "codemode-plan" },
      }),
      span({
        spanId: "sum-root",
        traceId: "sum",
        name: "ai.streamText",
        operation: "invoke_agent",
        startTime: iso(9_000),
        endTime: iso(11_000),
        attrString: { "ai.telemetry.functionId": "codemode-summary" },
      }),
    ]
    const messages = [userMessage("how u doing"), userMessage("help me plan my summer trip")]

    const timeline = buildCodemodeRunTimeline({ session, traces, spans, messages })

    expect(timeline.turns).toHaveLength(2)
    expect(timeline.turns[0]!.label).toBe("how u doing")
    expect(kinds(timeline.turns[0]!.nodes)).toEqual(["agent"])
    expect(timeline.turns[1]!.label).toBe("help me plan my summer trip")
    expect(kinds(timeline.turns[1]!.nodes)).toEqual(["plan", "summarize"])
  })

  it("degrades to name/operation heuristics when no codemode attributes exist (legacy data)", () => {
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
    expect(kinds(turn.nodes)).toEqual(["plan", "execute", "summarize"])
    // execute detection from operation + toolName is high confidence even without attributes
    expect(turn.nodes.find((n) => n.kind === "execute")!.confidence).toBe("high")
    // plan/summarize inferred from name only → low confidence
    expect(turn.nodes.find((n) => n.kind === "plan")!.confidence).toBe("low")
    expect(labels(turn.nodes.find((n) => n.kind === "execute")!.children)).toEqual(["lookupCity"])
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

  it("does not label a codemode-turn streamText trace as codemode execution", () => {
    const traces = [
      trace({ traceId: "agent-turn", startTime: iso(0), endTime: iso(900), rootSpanName: "ai.streamText" }),
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
      }),
    ]
    const timeline = buildCodemodeRunTimeline({ session, traces, spans, messages: [userMessage("hello")] })
    const node = timeline.turns[0]!.nodes[0]!
    expect(node.kind).toBe("agent")
    expect(node.label).toBe("Agent response")
    expect(node.confidence).toBe("high")
  })

  it("falls back to a single turn labelled by index when there is no user message", () => {
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
