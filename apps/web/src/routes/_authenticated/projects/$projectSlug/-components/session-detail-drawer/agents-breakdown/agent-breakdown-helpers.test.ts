import type { AgentGraphSpanInput } from "@domain/spans"
import { buildAgentGraph } from "@domain/spans"
import { describe, expect, it } from "vitest"
import { aggregateByAgentName, formatAgentCost, hasSubagents } from "./agent-breakdown-helpers.ts"

let clock = 0
function span(
  o: Partial<AgentGraphSpanInput> & Pick<AgentGraphSpanInput, "spanId" | "operation">,
): AgentGraphSpanInput {
  const start = clock
  clock += 10
  return {
    traceId: "t",
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

describe("agent-breakdown-helpers", () => {
  it("hasSubagents is false for a lone main and true once a subagent exists", () => {
    clock = 0
    const solo = buildAgentGraph({
      spans: [
        span({ spanId: "r", operation: "invoke_agent" }),
        span({ spanId: "g", operation: "chat", parentSpanId: "r", model: "m" }),
      ],
    })
    expect(hasSubagents(solo)).toBe(false)

    clock = 0
    const withSub = buildAgentGraph({
      spans: [
        span({ spanId: "r", operation: "invoke_agent" }),
        span({ spanId: "g", operation: "chat", parentSpanId: "r", model: "m" }),
        span({ spanId: "a", operation: "invoke_agent", parentSpanId: "r" }),
        span({ spanId: "ga", operation: "chat", parentSpanId: "a", model: "m" }),
      ],
    })
    expect(hasSubagents(withSub)).toBe(true)
  })

  it("aggregates by agent name, pins the main agent first, then sorts by cost", () => {
    clock = 0
    const graph = buildAgentGraph({
      spans: [
        span({ spanId: "r", operation: "invoke_agent" }),
        span({ spanId: "g", operation: "chat", parentSpanId: "r", model: "m", costTotalMicrocents: 100 }),
        span({ spanId: "a1", operation: "invoke_agent", parentSpanId: "r", name: "researcher" }),
        span({ spanId: "ga1", operation: "chat", parentSpanId: "a1", model: "m", costTotalMicrocents: 500 }),
        span({ spanId: "a2", operation: "invoke_agent", parentSpanId: "r", name: "researcher" }),
        span({ spanId: "ga2", operation: "chat", parentSpanId: "a2", model: "m", costTotalMicrocents: 700 }),
        span({ spanId: "a3", operation: "invoke_agent", parentSpanId: "r", name: "reviewer" }),
        span({ spanId: "ga3", operation: "chat", parentSpanId: "a3", model: "m", costTotalMicrocents: 200 }),
      ],
    })

    const rows = aggregateByAgentName(graph)

    expect(rows.map((r) => r.label)).toEqual(["Main agent", "researcher", "reviewer"])
    expect(rows[0]?.kind).toBe("main")

    const researcher = rows.find((r) => r.label === "researcher")
    expect(researcher?.instanceCount).toBe(2)
    expect(researcher?.totalCostMicrocents).toBe(1200)
  })

  it("formats microcents as a price", () => {
    expect(formatAgentCost(0)).toBe("$0")
    expect(formatAgentCost(100_000_000)).toBe("$1.00")
  })
})
