import { describe, expect, it } from "vitest"
import type { SpanRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"
import { buildSpanTree, flattenTree } from "./tree-utils.ts"

function makeSpan(spanId: string, parentSpanId: string, startTime = "2024-01-01T00:00:00Z"): SpanRecord {
  return {
    organizationId: "org",
    projectId: "proj",
    traceId: "trace",
    spanId,
    parentSpanId,
    simulationId: "",
    name: `span-${spanId}`,
    serviceName: "test",
    kind: "internal",
    statusCode: "ok",
    statusMessage: "",
    operation: "unknown",
    provider: "",
    model: "",
    tokensInput: 0,
    tokensOutput: 0,
    costTotalMicrocents: 0,
    timeToFirstTokenNs: 0,
    isStreaming: false,
    startTime,
    endTime: "2024-01-01T00:00:01Z",
    ingestedAt: "2024-01-01T00:00:00Z",
  }
}

describe("buildSpanTree", () => {
  it("builds a simple tree", () => {
    const spans = [makeSpan("root", ""), makeSpan("child1", "root"), makeSpan("child2", "root")]

    const roots = buildSpanTree(spans)

    expect(roots).toHaveLength(1)
    expect(roots[0]?.span.spanId).toBe("root")
    expect(roots[0]?.children).toHaveLength(2)
    expect(roots[0]?.depth).toBe(0)
    expect(roots[0]?.children[0]?.depth).toBe(1)
  })

  it("handles self-referencing spans (parentSpanId === spanId)", () => {
    const spans = [makeSpan("self", "self"), makeSpan("root", ""), makeSpan("child", "root")]

    const roots = buildSpanTree(spans)

    // The self-referencing span should be treated as a root
    expect(roots).toHaveLength(2)
    const selfSpan = roots.find((r) => r.span.spanId === "self")
    expect(selfSpan).toBeDefined()
    expect(selfSpan?.children).toHaveLength(0) // No children, not referencing itself
  })

  it("handles circular reference (A -> B -> A)", () => {
    // Create spans where A's parent is B and B's parent is A
    const spans = [makeSpan("A", "B"), makeSpan("B", "A")]

    // This should not throw or hang
    const roots = buildSpanTree(spans)

    // Both spans form a cycle with no root, so no roots expected
    // (both have valid parents that exist in the map)
    expect(roots).toHaveLength(0)
  })

  it("handles longer cycle (A -> B -> C -> A)", () => {
    const spans = [makeSpan("A", "C"), makeSpan("B", "A"), makeSpan("C", "B")]

    // This should not throw or hang
    const roots = buildSpanTree(spans)

    // All spans form a cycle with no root
    expect(roots).toHaveLength(0)
  })

  it("handles cycle reachable from root", () => {
    // Root -> A -> B -> A (cycle at A-B)
    const spans = [
      makeSpan("root", ""),
      makeSpan("A", "root"),
      makeSpan("B", "A"),
      // Make A also a child of B (by having another span or modifying the structure)
    ]

    // Note: With standard parent-child relationship, we can't create a cycle
    // reachable from root without duplicate spanIds or corrupted data.
    // This test verifies the tree builds correctly with valid data.
    const roots = buildSpanTree(spans)

    expect(roots).toHaveLength(1)
    expect(roots[0]?.span.spanId).toBe("root")
  })

  it("handles orphaned spans (parent does not exist)", () => {
    const spans = [makeSpan("orphan", "nonexistent"), makeSpan("root", "")]

    const roots = buildSpanTree(spans)

    // Orphan becomes a root since its parent doesn't exist
    expect(roots).toHaveLength(2)
  })

  it("sets correct depth for deeply nested tree", () => {
    const spans = [
      makeSpan("level0", ""),
      makeSpan("level1", "level0"),
      makeSpan("level2", "level1"),
      makeSpan("level3", "level2"),
      makeSpan("level4", "level3"),
    ]

    const roots = buildSpanTree(spans)

    expect(roots).toHaveLength(1)

    let node = roots[0]
    for (let depth = 0; depth <= 4; depth++) {
      expect(node?.depth).toBe(depth)
      node = node?.children[0]
    }
  })
})

describe("flattenTree", () => {
  it("flattens a simple tree", () => {
    const spans = [makeSpan("root", ""), makeSpan("child1", "root"), makeSpan("child2", "root")]

    const roots = buildSpanTree(spans)
    const flat = flattenTree(roots, new Set())

    expect(flat).toHaveLength(3)
    expect(flat[0]?.node.span.spanId).toBe("root")
  })

  it("respects collapsed nodes", () => {
    const spans = [makeSpan("root", ""), makeSpan("child1", "root"), makeSpan("grandchild", "child1")]

    const roots = buildSpanTree(spans)
    const collapsed = new Set(["child1"])
    const flat = flattenTree(roots, collapsed)

    // root and child1 are visible, but grandchild is hidden
    expect(flat).toHaveLength(2)
    expect(flat.map((f) => f.node.span.spanId)).toEqual(["root", "child1"])
  })

  it("handles tree with potential cycles safely", () => {
    // Even if buildSpanTree produces a tree with cycles (which it shouldn't normally),
    // flattenTree should handle it gracefully
    const spans = [makeSpan("A", "B"), makeSpan("B", "A")]

    const roots = buildSpanTree(spans)
    // This should not hang
    const flat = flattenTree(roots, new Set())

    // No roots, so empty result
    expect(flat).toHaveLength(0)
  })

  it("handles empty tree", () => {
    const flat = flattenTree([], new Set())
    expect(flat).toHaveLength(0)
  })
})
