import type { AgentGraphSpanInput } from "@domain/spans"
import { buildAgentGraph } from "@domain/spans"
import { describe, expect, it } from "vitest"
import { flattenAgentTree, formatAgentCost, hasSubagents, subtreeHasSubagents } from "./agent-breakdown-helpers.ts"

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
    const main = withSub.roots[0]
    expect(main && subtreeHasSubagents(main)).toBe(true)
    expect(main && flattenAgentTree(main).length).toBe(2)
  })

  it("formats microcents as a price", () => {
    expect(formatAgentCost(0)).toBe("$0")
    expect(formatAgentCost(100_000_000)).toBe("$1.00")
  })
})
