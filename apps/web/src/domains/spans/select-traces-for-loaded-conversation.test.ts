import { describe, expect, it } from "vitest"
import { selectTracesForLoadedConversation } from "./select-traces-for-loaded-conversation.ts"

function traces(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    traceId: `t${String(i).padStart(3, "0")}`,
    startTime: `2026-01-01T00:${String(i).padStart(2, "0")}:00.000Z`,
  }))
}

describe("selectTracesForLoadedConversation", () => {
  it("returns nothing when no messages are loaded", () => {
    expect(
      selectTracesForLoadedConversation({ traces: traces(10), loadedMessageCount: 0, totalMessages: 100 }),
    ).toEqual([])
  })

  it("returns traces oldest-first", () => {
    const input = [
      { traceId: "new", startTime: "2026-01-01T00:02:00.000Z" },
      { traceId: "old", startTime: "2026-01-01T00:00:00.000Z" },
      { traceId: "mid", startTime: "2026-01-01T00:01:00.000Z" },
    ]
    const selected = selectTracesForLoadedConversation({
      traces: input,
      loadedMessageCount: 10,
      totalMessages: 10,
    })
    expect(selected.map((t) => t.traceId)).toEqual(["old", "mid", "new"])
  })

  it("fetches all traces once the conversation is fully loaded", () => {
    const all = traces(20)
    const selected = selectTracesForLoadedConversation({
      traces: all,
      loadedMessageCount: 200,
      totalMessages: 200,
    })
    expect(selected).toHaveLength(20)
  })

  it("keeps a small window for the first conversation page on a long session", () => {
    const selected = selectTracesForLoadedConversation({
      traces: traces(100),
      loadedMessageCount: 25,
      totalMessages: 2000,
    })
    // ceil(25/2000 * 100) + 4 = 6, raised to MIN_TRACES (8)
    expect(selected).toHaveLength(8)
    expect(selected[0]?.traceId).toBe("t000")
    expect(selected[7]?.traceId).toBe("t007")
  })

  it("grows the window as more of the conversation is loaded", () => {
    const all = traces(100)
    const early = selectTracesForLoadedConversation({
      traces: all,
      loadedMessageCount: 25,
      totalMessages: 500,
    })
    const later = selectTracesForLoadedConversation({
      traces: all,
      loadedMessageCount: 250,
      totalMessages: 500,
    })
    expect(later.length).toBeGreaterThan(early.length)
    expect(later.map((t) => t.traceId).slice(0, early.length)).toEqual(early.map((t) => t.traceId))
  })
})
