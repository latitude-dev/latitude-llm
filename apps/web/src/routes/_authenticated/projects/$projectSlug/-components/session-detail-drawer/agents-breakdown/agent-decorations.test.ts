import { type AgentGraphSpanInput, buildAgentGraph } from "@domain/spans"
import { describe, expect, it } from "vitest"
import { buildSubagentToolCalls } from "./agent-decorations.ts"

let clock = 0
const s = (
  o: Partial<AgentGraphSpanInput> & Pick<AgentGraphSpanInput, "spanId" | "operation" | "traceId">,
): AgentGraphSpanInput => {
  const start = clock
  clock += 10
  return {
    parentSpanId: "",
    name: "",
    toolName: "",
    model: "",
    statusCode: "ok",
    startTime: new Date(start).toISOString(),
    endTime: new Date(start + 5).toISOString(),
    costTotalMicrocents: 0,
    tokensInput: 0,
    tokensOutput: 0,
    ...o,
  }
}

/** A subagent spawned by an execute_tool carrying `toolCallId`, with one owned generation. */
const subagentSpans = (traceId: string, toolCallId: string, toolName: string): AgentGraphSpanInput[] => [
  s({ traceId, spanId: `${traceId}-tool`, operation: "execute_tool", toolName, toolCallId, parentSpanId: "" }),
  s({ traceId, spanId: `${traceId}-gen`, operation: "chat", parentSpanId: `${traceId}-tool`, costTotalMicrocents: 1 }),
]

describe("buildSubagentToolCalls", () => {
  it("decorates a subagent-spawning tool call by its tool-call id", () => {
    clock = 0
    const graph = buildAgentGraph({ spans: subagentSpans("t1", "tc", "research") })
    const decorations = buildSubagentToolCalls({ graph })
    expect(decorations.get("tc")?.label).toBe("research")
  })

  it("skips a tool-call id shared by subagents in different traces (can't disambiguate)", () => {
    clock = 0
    const graph = buildAgentGraph({
      spans: [...subagentSpans("t1", "dup", "research"), ...subagentSpans("t2", "dup", "review")],
    })
    // Both traces register `dup` in the trace-scoped graph; the conversation matches on
    // the bare id, so decorating either would risk routing to the wrong subagent.
    const decorations = buildSubagentToolCalls({ graph })
    expect(decorations.has("dup")).toBe(false)
  })

  it("excludes the node whose own conversation is being decorated", () => {
    clock = 0
    const graph = buildAgentGraph({ spans: subagentSpans("t1", "tc", "research") })
    const [node] = [...graph.nodeByToolCallId.values()]
    const decorations = buildSubagentToolCalls({ graph, excludeNodeId: node?.id })
    expect(decorations.has("tc")).toBe(false)
  })
})
