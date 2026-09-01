import { describe, expect, it } from "vitest"
import {
  type AgentGraphSpanInput,
  type AgentNode,
  agentGraphToolCallKey,
  buildAgentGraph,
} from "../use-cases/build-agent-graph.ts"
import { transformOtlpToSpans } from "./transform.ts"
import type { OtlpExportTraceServiceRequest, OtlpKeyValue, OtlpSpan } from "./types.ts"

// Two harnesses, two processes, two OTLP batches, one trace: the parent exports a
// W3C traceparent when it launches the child, and the child emits against it. This
// is the ingest-side half of that contract — that the batches merge into one tree
// even though they arrive separately and out of order.

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736"
const HERMES_TURN_SPAN = "1111111111111111"
const HERMES_TOOL_SPAN = "2222222222222222"
const CLAUDE_TURN_SPAN = "3333333333333333"
const CLAUDE_CALL_SPAN = "4444444444444444"
const SESSION_ID = "hermes-session-1"
const TOOL_CALL_ID = "toolu_launch_01"

const context = {
  organizationId: "org_test",
  apiKeyId: "key_test",
  ingestedAt: new Date("2026-01-01T00:00:00Z"),
  defaultProjectId: "proj_test",
  projectIdBySlug: new Map<string, string>(),
}

const str = (key: string, stringValue: string): OtlpKeyValue => ({ key, value: { stringValue } })

function span(overrides: Partial<OtlpSpan> & Pick<OtlpSpan, "spanId" | "name">): OtlpSpan {
  return {
    traceId: TRACE_ID,
    parentSpanId: "",
    startTimeUnixNano: "1710590400000000000",
    endTimeUnixNano: "1710590401000000000",
    attributes: [],
    ...overrides,
  } as OtlpSpan
}

function batch(serviceName: string, scopeName: string, spans: OtlpSpan[]): OtlpExportTraceServiceRequest {
  return {
    resourceSpans: [
      {
        resource: { attributes: [str("service.name", serviceName)] },
        scopeSpans: [{ scope: { name: scopeName, version: "1" }, spans }],
      },
    ],
  }
}

// The parent turn plus the tool call that launches the child harness.
const hermesBatch = batch("hermes-agent", "latitude-telemetry-hermes", [
  span({
    spanId: HERMES_TURN_SPAN,
    name: "interaction",
    attributes: [str("span.type", "interaction"), str("session.id", SESSION_ID)],
  }),
  span({
    spanId: HERMES_TOOL_SPAN,
    parentSpanId: HERMES_TURN_SPAN,
    name: "tool_call:launch_coding_agent",
    attributes: [
      str("span.type", "tool_execution"),
      str("gen_ai.operation.name", "execute_tool"),
      str("gen_ai.tool.name", "launch_coding_agent"),
      // The id of the tool_use block in the parent's assistant message. The
      // conversation view keys its inline "open subagent" affordance off this, so
      // without it the session is a graph node with no way into it from the transcript.
      str("gen_ai.tool.call.id", TOOL_CALL_ID),
      str("session.id", SESSION_ID),
    ],
  }),
])

// A separate process, shipping after the parent turn already closed.
const claudeCodeBatch = batch("claude-code", "@latitude-data/claude-code-telemetry", [
  span({
    spanId: CLAUDE_TURN_SPAN,
    parentSpanId: HERMES_TOOL_SPAN,
    name: "interaction",
    attributes: [str("span.type", "interaction"), str("session.id", SESSION_ID)],
  }),
  span({
    spanId: CLAUDE_CALL_SPAN,
    parentSpanId: CLAUDE_TURN_SPAN,
    name: "llm_request",
    attributes: [
      str("span.type", "llm_request"),
      str("gen_ai.operation.name", "chat"),
      str("gen_ai.request.model", "claude-sonnet-4-6"),
      str("session.id", SESSION_ID),
    ],
  }),
])

function ingest(...batches: OtlpExportTraceServiceRequest[]) {
  return batches.flatMap((b) => [...transformOtlpToSpans(b, context).spans])
}

function graphInput(spans: ReturnType<typeof ingest>): AgentGraphSpanInput[] {
  return spans.map((s) => ({
    traceId: s.traceId,
    spanId: s.spanId,
    parentSpanId: s.parentSpanId,
    operation: s.operation,
    name: s.name,
    toolName: s.toolName,
    model: s.model,
    statusCode: s.statusCode,
    startTime: s.startTime,
    endTime: s.endTime,
    costTotalMicrocents: s.costTotalMicrocents,
    tokensInput: s.tokensInput,
    tokensOutput: s.tokensOutput,
    toolCallId: s.toolCallId,
  }))
}

function flatten(roots: readonly AgentNode[]): AgentNode[] {
  const out: AgentNode[] = []
  const walk = (node: AgentNode) => {
    out.push(node)
    for (const child of node.children) walk(child)
  }
  for (const root of roots) walk(root)
  return out
}

describe("cross-harness trace correlation", () => {
  it("keeps both emitters' spans on one trace and one session", () => {
    const spans = ingest(hermesBatch, claudeCodeBatch)

    expect(spans).toHaveLength(4)
    expect(new Set(spans.map((s) => s.traceId)).size).toBe(1)
    expect(new Set(spans.map((s) => s.sessionId))).toEqual(new Set([SESSION_ID]))
  })

  it("preserves the child's parent pointer into the launching tool span", () => {
    const spans = ingest(hermesBatch, claudeCodeBatch)
    const childTurn = spans.find((s) => s.spanId === CLAUDE_TURN_SPAN)

    // The causal edge the shared session id alone cannot express: this Claude Code
    // session was launched by that specific Hermes tool call.
    expect(childTurn?.parentSpanId).toBe(HERMES_TOOL_SPAN)
  })

  it("resolves one connected tree across the two emitters", () => {
    const graph = buildAgentGraph({ spans: graphInput(ingest(hermesBatch, claudeCodeBatch)) })
    const nodes = flatten(graph.roots)
    const launched = nodes.find((n) => n.trigger.type === "tool" && n.trigger.toolName === "launch_coding_agent")

    expect(graph.roots).toHaveLength(1)
    // The Hermes turn is the main agent; the Claude Code session collapses into the
    // tool span that launched it and becomes a subagent node under it — the same
    // shape an in-harness subagent produces, so it drills in the same way.
    expect(graph.roots[0]?.kind).toBe("main")
    expect(launched?.kind).toBe("subagent")
    expect(launched?.parentId).toBe(graph.roots[0]?.id)
    expect(launched?.ownGenerationCount).toBe(1)
    // What the conversation view matches against the parent's tool_use block to
    // render the drill-in, exactly as it does for an in-harness subagent.
    expect(launched?.trigger).toEqual({ type: "tool", toolName: "launch_coding_agent", toolCallId: TOOL_CALL_ID })
    expect(graph.nodeByToolCallId.get(agentGraphToolCallKey(TRACE_ID, TOOL_CALL_ID))?.id).toBe(launched?.id)
  })

  it("merges the same way when the child's batch is ingested first", () => {
    // The child runs in another process and can outlive the parent turn, so its spans
    // routinely arrive after the root has already been written — and sometimes before.
    const reversed = ingest(claudeCodeBatch, hermesBatch)
    const forward = ingest(hermesBatch, claudeCodeBatch)

    const key = (s: { spanId: string; parentSpanId: string }) => `${s.spanId}<-${s.parentSpanId}`
    expect(new Set(reversed.map(key))).toEqual(new Set(forward.map(key)))
    expect(buildAgentGraph({ spans: graphInput(reversed) }).roots).toHaveLength(1)
  })

  it("leaves the child rooting its own trace when no context was inherited", () => {
    const ownTraceId = "0af7651916cd43dd8448eb211c80319c"
    const standalone = batch("claude-code", "@latitude-data/claude-code-telemetry", [
      span({
        traceId: ownTraceId,
        spanId: CLAUDE_TURN_SPAN,
        name: "interaction",
        attributes: [str("span.type", "interaction"), str("session.id", "claude-own-session")],
      }),
    ])
    const spans = ingest(hermesBatch, standalone)

    expect(new Set(spans.map((s) => s.traceId))).toEqual(new Set([TRACE_ID, ownTraceId]))
    expect(buildAgentGraph({ spans: graphInput(spans) }).roots.length).toBeGreaterThan(1)
  })
})

// Two Cloudflare Durable Objects, two isolates with no shared memory: the orchestrator hands the
// active tool span over its RPC call and the planner emits against it from its own Latitude SDK.
// Same contract as above, over an argument instead of the environment.
const DO_TOOL_SPAN = "5555555555555555"
const DO_PLANNER_SPAN = "6666666666666666"
const DO_SESSION_ID = "cloudflare-session-1"
const DO_TOOL_CALL_ID = "call_plan_01"

const DO_TURN_SPAN = "7777777777777777"
const DO_ORCHESTRATOR_MODEL_SPAN = "8888888888888888"
const DO_PLANNER_MODEL_SPAN = "9999999999999999"

const orchestratorBatch = batch("orchestrator-agent", "so.latitude.instrumentation.cloudflare-think", [
  span({
    spanId: DO_TURN_SPAN,
    name: "ai.streamText",
    attributes: [str("ai.operationId", "ai.streamText"), str("session.id", DO_SESSION_ID)],
  }),
  span({
    spanId: DO_ORCHESTRATOR_MODEL_SPAN,
    parentSpanId: DO_TURN_SPAN,
    name: "ai.streamText.doStream",
    attributes: [
      str("ai.operationId", "ai.streamText.doStream"),
      str("ai.model.provider", "anthropic.messages"),
      str("ai.model.id", "claude-sonnet-4-5"),
      str("session.id", DO_SESSION_ID),
    ],
  }),
  span({
    spanId: DO_TOOL_SPAN,
    parentSpanId: DO_ORCHESTRATOR_MODEL_SPAN,
    name: "ai.toolCall",
    attributes: [
      str("ai.operationId", "ai.toolCall"),
      str("ai.toolCall.name", "plan"),
      str("ai.toolCall.id", DO_TOOL_CALL_ID),
      str("session.id", DO_SESSION_ID),
    ],
  }),
])

const plannerBatch = batch("planner-agent", "so.latitude.instrumentation.planner", [
  span({
    spanId: DO_PLANNER_SPAN,
    parentSpanId: DO_TOOL_SPAN,
    name: "ai.generateText",
    attributes: [str("ai.operationId", "ai.generateText"), str("session.id", DO_SESSION_ID)],
  }),
  span({
    spanId: DO_PLANNER_MODEL_SPAN,
    parentSpanId: DO_PLANNER_SPAN,
    name: "ai.generateText.doGenerate",
    attributes: [
      str("ai.operationId", "ai.generateText.doGenerate"),
      str("ai.model.provider", "anthropic.messages"),
      str("ai.model.id", "claude-sonnet-4-5"),
      str("session.id", DO_SESSION_ID),
    ],
  }),
])

describe("Durable Object trace correlation", () => {
  it("resolves the second agent as a subagent of the tool call that invoked it", () => {
    const spans = ingest(orchestratorBatch, plannerBatch)
    const graph = buildAgentGraph({ spans: graphInput(spans) })
    const planner = flatten(graph.roots).find((n) => n.trigger.type === "tool" && n.trigger.toolName === "plan")

    expect(new Set(spans.map((s) => s.traceId)).size).toBe(1)
    expect(graph.roots).toHaveLength(1)
    expect(planner?.kind).toBe("subagent")
    expect(planner?.parentId).toBe(graph.roots[0]?.id)
    expect(planner?.ownGenerationCount).toBe(1)
    expect(planner?.trigger).toEqual({ type: "tool", toolName: "plan", toolCallId: DO_TOOL_CALL_ID })
  })

  it("merges the same way when the evicted object's batch arrives first", () => {
    // Either object can be evicted mid-turn and flush after the other has already shipped.
    const reversed = buildAgentGraph({ spans: graphInput(ingest(plannerBatch, orchestratorBatch)) })
    const forward = buildAgentGraph({ spans: graphInput(ingest(orchestratorBatch, plannerBatch)) })

    expect(reversed.roots).toHaveLength(1)
    expect(flatten(reversed.roots).map((n) => n.trigger)).toEqual(flatten(forward.roots).map((n) => n.trigger))
  })
})
