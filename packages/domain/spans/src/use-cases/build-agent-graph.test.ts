import { describe, expect, it } from "vitest"
import {
  type AgentGraphSpanInput,
  type AgentNode,
  agentGraphSpanKey,
  agentGraphToolCallKey,
  buildAgentGraph,
} from "./build-agent-graph.ts"

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
    expect(graph.nodeByToolCallId.get(agentGraphToolCallKey("trace-a", "tc1"))).toBe(sub)
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

  it("treats a Claude Code interaction as the backed main and tool:Agent → nested interaction as a subagent", () => {
    clock = 0
    const spans = [
      // Root turn: interaction (invoke_agent) with a chat leaf and two tool calls.
      span({ spanId: "root", operation: "invoke_agent", name: "interaction" }),
      gen({ spanId: "g1", parentSpanId: "root" }),
      span({
        spanId: "read",
        operation: "execute_tool",
        toolName: "Read",
        toolCallId: "tc-read",
        parentSpanId: "root",
      }),
      span({
        spanId: "agent",
        operation: "execute_tool",
        toolName: "Agent",
        toolCallId: "tc-agent",
        parentSpanId: "root",
      }),
      // The Agent tool nests its own interaction with its own generation.
      span({ spanId: "sub-int", operation: "invoke_agent", name: "interaction", parentSpanId: "agent" }),
      gen({ spanId: "g2", parentSpanId: "sub-int" }),
    ]
    const graph = buildAgentGraph({ spans })
    expect(graph.roots).toHaveLength(1)
    const main = graph.roots[0] as AgentNode
    expect(main.kind).toBe("main")
    expect(main.isVirtual).toBe(false)
    expect(main.ref.spanId).toBe("root")
    expect(main.label).toBe("Main agent")
    const subs = findSubagents(graph)
    expect(subs).toHaveLength(1)
    const sub = subs[0] as AgentNode
    expect(sub.ref.spanId).toBe("agent")
    expect(sub.trigger).toEqual({ type: "tool", toolName: "Agent", toolCallId: "tc-agent" })
    expect(sub.label).toBe("Agent")
    expect(sub.ownGenerationCount).toBe(1)
    expect(main.ownGenerationCount).toBe(1)
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

  it("does not double-count a virtual main's own generations when it has a subagent", () => {
    clock = 0
    const spans = [
      gen({ spanId: "g1", parentSpanId: "" }),
      gen({ spanId: "g2", parentSpanId: "" }),
      span({ spanId: "tool", operation: "execute_tool", toolName: "t", toolCallId: "tc", parentSpanId: "" }),
      gen({ spanId: "g3", parentSpanId: "tool" }),
    ]
    const graph = buildAgentGraph({ spans })
    const main = graph.roots[0] as AgentNode
    expect(main.isVirtual).toBe(true)
    expect(findSubagents(graph)).toHaveLength(1)
    // g1 + g2 are main-scope; g3 belongs to the subagent. Not 4 (the old double-count).
    expect(main.ownGenerationCount).toBe(2)
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

  it("keeps subagents from different traces distinct when they share span/tool-call ids", () => {
    clock = 0
    const spans = [
      // Two traces whose delegating tool span and tool-call id collide by value.
      span({ traceId: "t1", spanId: "root", operation: "invoke_agent", parentSpanId: "" }),
      span({
        traceId: "t1",
        spanId: "tool",
        operation: "execute_tool",
        toolName: "a",
        toolCallId: "tc",
        parentSpanId: "root",
      }),
      gen({ traceId: "t1", spanId: "g", parentSpanId: "tool" }),
      span({ traceId: "t2", spanId: "root", operation: "invoke_agent", parentSpanId: "" }),
      span({
        traceId: "t2",
        spanId: "tool",
        operation: "execute_tool",
        toolName: "b",
        toolCallId: "tc",
        parentSpanId: "root",
      }),
      gen({ traceId: "t2", spanId: "g", parentSpanId: "tool" }),
    ]
    const graph = buildAgentGraph({ spans })
    const sub1 = graph.nodeByToolCallId.get(agentGraphToolCallKey("t1", "tc")) as AgentNode
    const sub2 = graph.nodeByToolCallId.get(agentGraphToolCallKey("t2", "tc")) as AgentNode
    expect(sub1.label).toBe("a")
    expect(sub2.label).toBe("b")
    expect(sub1).not.toBe(sub2)
    expect(graph.nodeForSpanId.get(agentGraphSpanKey("t1", "g"))).toBe(sub1)
    expect(graph.nodeForSpanId.get(agentGraphSpanKey("t2", "g"))).toBe(sub2)
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
    const sub = graph.nodeByToolCallId.get(agentGraphToolCallKey("trace-a", "tc")) as AgentNode
    expect(sub).toBeDefined()
    // the generation nested under the collapsed tool resolves to the subagent node
    expect(graph.nodeForSpanId.get(agentGraphSpanKey("trace-a", "g"))).toBe(sub)
    expect(graph.nodeForSpanId.get(agentGraphSpanKey("trace-a", "tool"))).toBe(sub)
    // a main-scope span resolves to the main
    expect(graph.nodeForSpanId.get(agentGraphSpanKey("trace-a", "root"))?.kind).toBe("main")
  })

  describe("agent name labeling", () => {
    it("labels a tool subagent from the collapsed invoke_agent's agentName", () => {
      clock = 0
      const spans = [
        span({ spanId: "root", operation: "invoke_agent", agentName: "main_agent" }),
        gen({ spanId: "g1", parentSpanId: "root", agentName: "main_agent" }),
        // The tool call span carries the *parent* agent's name — must be ignored.
        span({
          spanId: "tool",
          operation: "execute_tool",
          toolName: "task",
          toolCallId: "tc1",
          parentSpanId: "root",
          agentName: "main_agent",
        }),
        span({ spanId: "inner", operation: "invoke_agent", parentSpanId: "tool", agentName: "npc_actor" }),
        gen({ spanId: "g2", parentSpanId: "inner", agentName: "npc_actor" }),
      ]
      const graph = buildAgentGraph({ spans })
      const sub = findSubagents(graph)[0] as AgentNode
      expect(sub.ref.spanId).toBe("tool")
      expect(sub.label).toBe("npc_actor")
    })

    it("falls back to the tool name when no agent name is present", () => {
      clock = 0
      const spans = [
        span({ spanId: "root", operation: "invoke_agent" }),
        gen({ spanId: "g1", parentSpanId: "root" }),
        span({ spanId: "tool", operation: "execute_tool", toolName: "task", toolCallId: "tc1", parentSpanId: "root" }),
        span({ spanId: "inner", operation: "invoke_agent", parentSpanId: "tool" }),
        gen({ spanId: "g2", parentSpanId: "inner" }),
      ]
      const graph = buildAgentGraph({ spans })
      expect((findSubagents(graph)[0] as AgentNode).label).toBe("task")
    })

    it("never labels a tool boundary from its own agentName", () => {
      clock = 0
      const spans = [
        span({ spanId: "root", operation: "invoke_agent" }),
        gen({ spanId: "g1", parentSpanId: "root" }),
        // execute_tool boundary owning a generation directly; its own agentName is the parent's.
        span({
          spanId: "tool",
          operation: "execute_tool",
          toolName: "task",
          toolCallId: "tc1",
          parentSpanId: "root",
          agentName: "main_agent",
        }),
        gen({ spanId: "g2", parentSpanId: "tool" }),
      ]
      const graph = buildAgentGraph({ spans })
      expect((findSubagents(graph)[0] as AgentNode).label).toBe("task")
    })

    it("names the main node from the root invoke_agent's agentName", () => {
      clock = 0
      const spans = [
        span({ spanId: "root", operation: "invoke_agent", name: "ai.generateText", agentName: "orchestrator" }),
        gen({ spanId: "g1", parentSpanId: "root", agentName: "orchestrator" }),
      ]
      const graph = buildAgentGraph({ spans })
      expect((graph.roots[0] as AgentNode).label).toBe("orchestrator")
    })

    it("keeps the main labeled 'Main agent' rather than the backing span's framework name", () => {
      clock = 0
      const spans = [
        span({ spanId: "root", operation: "invoke_agent", name: "interaction" }),
        gen({ spanId: "g1", parentSpanId: "root" }),
      ]
      const graph = buildAgentGraph({ spans })
      const main = graph.roots[0] as AgentNode
      expect(main.isVirtual).toBe(false)
      expect(main.label).toBe("Main agent")
    })

    it("names an invoke_agent subagent from its own agentName", () => {
      clock = 0
      const spans = [
        span({ spanId: "root", operation: "invoke_agent", agentName: "main_agent" }),
        gen({ spanId: "g0", parentSpanId: "root", agentName: "main_agent" }),
        span({ spanId: "a", operation: "invoke_agent", parentSpanId: "root", agentName: "researcher" }),
        gen({ spanId: "ga", parentSpanId: "a", agentName: "researcher" }),
      ]
      const graph = buildAgentGraph({ spans })
      const sub = findSubagents(graph).find((s) => s.ref.spanId === "a") as AgentNode
      expect(sub.label).toBe("researcher")
    })

    it("falls back to an owned generation's agentName when the identity span carries none", () => {
      clock = 0
      const spans = [
        span({ spanId: "root", operation: "invoke_agent" }),
        gen({ spanId: "g1", parentSpanId: "root" }),
        span({ spanId: "tool", operation: "execute_tool", toolName: "task", toolCallId: "tc1", parentSpanId: "root" }),
        span({ spanId: "inner", operation: "invoke_agent", parentSpanId: "tool" }),
        gen({ spanId: "g2", parentSpanId: "inner", agentName: "worker" }),
      ]
      const graph = buildAgentGraph({ spans })
      expect((findSubagents(graph)[0] as AgentNode).label).toBe("worker")
    })
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
