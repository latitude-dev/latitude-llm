import { describe, expect, it } from "vitest"
import { type AgentGraphSpanInput, type AgentNode, buildAgentGraph } from "./build-agent-graph.ts"

let clock = 0

function span(
  overrides: Partial<AgentGraphSpanInput> & Pick<AgentGraphSpanInput, "spanId" | "operation">,
): AgentGraphSpanInput {
  const start = clock
  clock += 10
  return {
    traceId: "trace-a",
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
    ...overrides,
  }
}

function gen(
  overrides: Partial<AgentGraphSpanInput> & Pick<AgentGraphSpanInput, "spanId" | "parentSpanId">,
): AgentGraphSpanInput {
  return span({
    operation: "chat",
    model: "gpt-4o",
    costTotalMicrocents: 1000,
    tokensInput: 10,
    tokensOutput: 5,
    ...overrides,
  })
}

function findSubagents(graph: ReturnType<typeof buildAgentGraph>): AgentNode[] {
  const out: AgentNode[] = []
  const walk = (node: AgentNode) => {
    if (node.kind === "subagent") out.push(node)
    for (const c of node.children) walk(c)
  }
  for (const root of graph.roots) walk(root)
  return out
}

describe("buildAgentGraph", () => {
  it("top-level Vercel invoke_agent is the backed main", () => {
    clock = 0
    const spans = [
      span({ spanId: "root", operation: "invoke_agent", name: "ai.generateText" }),
      gen({ spanId: "g1", parentSpanId: "root" }),
    ]
    const graph = buildAgentGraph({ spans })
    expect(graph.roots).toHaveLength(1)
    const main = graph.roots[0] as AgentNode
    expect(main.kind).toBe("main")
    expect(main.isVirtual).toBe(false)
    expect(main.ref.spanId).toBe("root")
    expect(findSubagents(graph)).toHaveLength(0)
  })

  it("collapses Vercel double-wrap (tool → inner generateText) into the tool subagent", () => {
    clock = 0
    const spans = [
      span({ spanId: "root", operation: "invoke_agent" }),
      gen({ spanId: "g1", parentSpanId: "root" }),
      span({
        spanId: "tool",
        operation: "execute_tool",
        toolName: "delegate",
        toolCallId: "tc1",
        parentSpanId: "root",
      }),
      span({ spanId: "inner", operation: "invoke_agent", parentSpanId: "tool" }),
      gen({ spanId: "g2", parentSpanId: "inner" }),
    ]
    const graph = buildAgentGraph({ spans })
    const subs = findSubagents(graph)
    expect(subs).toHaveLength(1)
    const sub = subs[0] as AgentNode
    expect(sub.ref.spanId).toBe("tool")
    expect(sub.trigger).toEqual({ type: "tool", toolName: "delegate", toolCallId: "tc1" })
    expect(sub.ownGenerationCount).toBe(1)
    expect(graph.nodeByToolCallId.get("tc1")).toBe(sub)
  })

  it("treats an execute_tool with no generations as a plain tool, not an agent", () => {
    clock = 0
    const spans = [
      span({ spanId: "root", operation: "invoke_agent" }),
      gen({ spanId: "g1", parentSpanId: "root" }),
      span({ spanId: "tool", operation: "execute_tool", toolName: "search", parentSpanId: "root" }),
    ]
    const graph = buildAgentGraph({ spans })
    expect(findSubagents(graph)).toHaveLength(0)
  })

  it("detects OpenClaw nested subagents, skipping the transparent wrapper", () => {
    clock = 0
    const spans = [
      span({ spanId: "root", operation: "invoke_agent", name: "agent" }),
      gen({ spanId: "g1", parentSpanId: "root" }),
      span({ spanId: "wrapper", operation: "unspecified", name: "subagent", parentSpanId: "root" }),
      span({ spanId: "child", operation: "invoke_agent", name: "agent", parentSpanId: "wrapper" }),
      gen({ spanId: "g2", parentSpanId: "child" }),
    ]
    const graph = buildAgentGraph({ spans })
    const subs = findSubagents(graph)
    expect(subs).toHaveLength(1)
    expect((subs[0] as AgentNode).ref.spanId).toBe("child")
    expect((subs[0] as AgentNode).trigger.type).toBe("invoke_agent")
  })

  it("detects parallel subagents under the main", () => {
    clock = 0
    const spans = [
      span({ spanId: "root", operation: "invoke_agent" }),
      gen({ spanId: "g0", parentSpanId: "root" }),
      span({ spanId: "a", operation: "invoke_agent", parentSpanId: "root" }),
      gen({ spanId: "ga", parentSpanId: "a" }),
      span({ spanId: "b", operation: "invoke_agent", parentSpanId: "root" }),
      gen({ spanId: "gb", parentSpanId: "b" }),
    ]
    const graph = buildAgentGraph({ spans })
    const main = graph.roots[0] as AgentNode
    expect(main.children.filter((c) => c.kind === "subagent")).toHaveLength(2)
  })

  it("detects nested subagents (recursion + depth)", () => {
    clock = 0
    const spans = [
      span({ spanId: "root", operation: "invoke_agent" }),
      gen({ spanId: "g0", parentSpanId: "root" }),
      span({ spanId: "a", operation: "invoke_agent", parentSpanId: "root" }),
      gen({ spanId: "ga", parentSpanId: "a" }),
      span({ spanId: "b", operation: "invoke_agent", parentSpanId: "a" }),
      gen({ spanId: "gb", parentSpanId: "b" }),
    ]
    const graph = buildAgentGraph({ spans })
    const subs = findSubagents(graph)
    const a = subs.find((s) => s.ref.spanId === "a") as AgentNode
    const b = subs.find((s) => s.ref.spanId === "b") as AgentNode
    expect(a.depth).toBe(1)
    expect(b.depth).toBe(2)
    expect(b.parentId).toBe(a.id)
  })

  it("handles a one-shot single-generation subagent", () => {
    clock = 0
    const spans = [
      span({ spanId: "root", operation: "invoke_agent" }),
      span({ spanId: "tool", operation: "execute_tool", toolName: "t", toolCallId: "tc", parentSpanId: "root" }),
      span({ spanId: "inner", operation: "invoke_agent", parentSpanId: "tool" }),
      gen({ spanId: "g", parentSpanId: "inner" }),
    ]
    const graph = buildAgentGraph({ spans })
    const subs = findSubagents(graph)
    expect(subs).toHaveLength(1)
    expect((subs[0] as AgentNode).ownGenerationCount).toBe(1)
  })

  it("uses a virtual main when there is no invoke_agent at all", () => {
    clock = 0
    const spans = [gen({ spanId: "g1", parentSpanId: "" }), gen({ spanId: "g2", parentSpanId: "" })]
    const graph = buildAgentGraph({ spans })
    const main = graph.roots[0] as AgentNode
    expect(main.isVirtual).toBe(true)
    expect(main.ref.spanId).toBeNull()
    expect(findSubagents(graph)).toHaveLength(0)
  })

  it("uses a virtual main when there are multiple roots", () => {
    clock = 0
    const spans = [
      span({ spanId: "r1", operation: "invoke_agent", parentSpanId: "" }),
      gen({ spanId: "g1", parentSpanId: "r1" }),
      span({ spanId: "r2", operation: "invoke_agent", parentSpanId: "" }),
      gen({ spanId: "g2", parentSpanId: "r2" }),
    ]
    const graph = buildAgentGraph({ spans })
    const main = graph.roots[0] as AgentNode
    expect(main.isVirtual).toBe(true)
    expect(findSubagents(graph)).toHaveLength(2)
  })

  it("attributes embedding cost to the owning scope", () => {
    clock = 0
    const spans = [
      span({ spanId: "root", operation: "invoke_agent" }),
      gen({ spanId: "g1", parentSpanId: "root" }),
      span({ spanId: "emb", operation: "embeddings", parentSpanId: "root", costTotalMicrocents: 500, tokensInput: 3 }),
    ]
    const graph = buildAgentGraph({ spans })
    const main = graph.roots[0] as AgentNode
    expect(main.own.costMicrocents).toBe(1500)
  })

  it("propagates errors from owned generations", () => {
    clock = 0
    const spans = [
      span({ spanId: "root", operation: "invoke_agent" }),
      gen({ spanId: "g1", parentSpanId: "root", statusCode: "error" }),
    ]
    const graph = buildAgentGraph({ spans })
    expect((graph.roots[0] as AgentNode).hasError).toBe(true)
  })

  it("produces one main per trace in a multi-trace forest", () => {
    clock = 0
    const spans = [
      span({ traceId: "t1", spanId: "r1", operation: "invoke_agent", parentSpanId: "" }),
      gen({ traceId: "t1", spanId: "g1", parentSpanId: "r1" }),
      span({ traceId: "t2", spanId: "r2", operation: "invoke_agent", parentSpanId: "" }),
      gen({ traceId: "t2", spanId: "g2", parentSpanId: "r2" }),
    ]
    const graph = buildAgentGraph({ spans })
    expect(graph.roots).toHaveLength(2)
    expect(graph.roots.every((r) => r.kind === "main")).toBe(true)
  })

  it("upholds the cost invariant: Σ own === trace total === main total", () => {
    clock = 0
    const spans = [
      span({ spanId: "root", operation: "invoke_agent" }),
      gen({ spanId: "g0", parentSpanId: "root", costTotalMicrocents: 1000 }),
      span({ spanId: "a", operation: "invoke_agent", parentSpanId: "root" }),
      gen({ spanId: "ga", parentSpanId: "a", costTotalMicrocents: 2000 }),
      span({ spanId: "b", operation: "invoke_agent", parentSpanId: "a" }),
      gen({ spanId: "gb", parentSpanId: "b", costTotalMicrocents: 3000 }),
    ]
    const graph = buildAgentGraph({ spans })
    const traceTotal = spans.reduce((sum, s) => sum + s.costTotalMicrocents, 0)
    const sumOwn = [...graph.nodesById.values()].reduce((sum, n) => sum + n.own.costMicrocents, 0)
    expect(sumOwn).toBe(traceTotal)
    expect((graph.roots[0] as AgentNode).total.costMicrocents).toBe(traceTotal)
  })

  it("resolves any span id and tool-call id to the owning node", () => {
    clock = 0
    const spans = [
      span({ spanId: "root", operation: "invoke_agent" }),
      span({ spanId: "tool", operation: "execute_tool", toolName: "t", toolCallId: "tc", parentSpanId: "root" }),
      span({ spanId: "inner", operation: "invoke_agent", parentSpanId: "tool" }),
      gen({ spanId: "g", parentSpanId: "inner" }),
    ]
    const graph = buildAgentGraph({ spans })
    const sub = graph.nodeByToolCallId.get("tc") as AgentNode
    expect(sub).toBeDefined()
    // the generation nested under the collapsed tool resolves to the subagent node
    expect(graph.nodeForSpanId.get("g")).toBe(sub)
    expect(graph.nodeForSpanId.get("tool")).toBe(sub)
    // a main-scope span resolves to the main
    expect(graph.nodeForSpanId.get("root")?.kind).toBe("main")
  })

  it("is resilient to orphan / cycle / self-referential parents", () => {
    clock = 0
    const spans = [
      span({ spanId: "root", operation: "invoke_agent", parentSpanId: "root" }), // self-ref
      gen({ spanId: "g1", parentSpanId: "root" }),
      span({ spanId: "x", operation: "invoke_agent", parentSpanId: "y" }), // cycle
      span({ spanId: "y", operation: "invoke_agent", parentSpanId: "x" }),
      gen({ spanId: "orphan", parentSpanId: "missing" }),
    ]
    expect(() => buildAgentGraph({ spans })).not.toThrow()
    const graph = buildAgentGraph({ spans })
    expect(graph.roots.length).toBeGreaterThanOrEqual(1)
  })
})
