import { describe, expect, it } from "vitest"
import { getAdjacentSpanSelection, spanTreeSelectionKey, toggleCollapsedSpan } from "./grouped-tree-state.ts"

const visibleSelections = [
  { traceId: "trace-a", spanId: "root" },
  { traceId: "trace-a", spanId: "shared" },
  { traceId: "trace-b", spanId: "shared" },
  { traceId: "trace-b", spanId: "child" },
]

describe("grouped span tree state", () => {
  it("navigates across trace boundaries in displayed order", () => {
    expect(getAdjacentSpanSelection(visibleSelections, visibleSelections[1] ?? null, "next")).toEqual(
      visibleSelections[2],
    )
    expect(getAdjacentSpanSelection(visibleSelections, visibleSelections[2] ?? null, "previous")).toEqual(
      visibleSelections[1],
    )
    expect(getAdjacentSpanSelection(visibleSelections, null, "next")).toEqual(visibleSelections[0])
    expect(getAdjacentSpanSelection(visibleSelections, null, "previous")).toEqual(visibleSelections[3])
  })

  it("keeps identical span ids independently selected and collapsed by trace", () => {
    const first = visibleSelections[1]
    const second = visibleSelections[2]
    if (!first || !second) throw new Error("expected fixture selections")

    expect(spanTreeSelectionKey(first)).not.toBe(spanTreeSelectionKey(second))

    const firstCollapsed = toggleCollapsedSpan(new Set(), first)
    const bothCollapsed = toggleCollapsedSpan(firstCollapsed, second)
    const secondCollapsed = toggleCollapsedSpan(bothCollapsed, first)

    expect(firstCollapsed).toEqual(new Set(["trace-a:shared"]))
    expect(bothCollapsed).toEqual(new Set(["trace-a:shared", "trace-b:shared"]))
    expect(secondCollapsed).toEqual(new Set(["trace-b:shared"]))
  })
})
