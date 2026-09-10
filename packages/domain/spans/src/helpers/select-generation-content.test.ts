import { SpanId, TraceId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { type GenerationContentCandidate, selectGenerationContentWithinBudget } from "./select-generation-content.ts"

const candidate = (sessionKey: string, spanId: string, bytes: number, offsetMs = 0): GenerationContentCandidate => ({
  sessionKey,
  traceId: TraceId(`trace-${sessionKey}`),
  spanId: SpanId(spanId),
  startTime: new Date(1_700_000_000_000 + offsetMs),
  bytes,
})

const keys = (selected: readonly GenerationContentCandidate[]) => selected.map(({ spanId }) => spanId as string)

describe("selectGenerationContentWithinBudget", () => {
  const budget = { perSessionBytes: 100, totalBytes: 1_000 }

  it("skips generations that stored no content", () => {
    const selected = selectGenerationContentWithinBudget({
      candidates: [candidate("s1", "a", 0), candidate("s1", "b", 10, 1)],
      budget,
    })

    expect(keys(selected)).toEqual(["b"])
  })

  it("gives every session its own budget", () => {
    const selected = selectGenerationContentWithinBudget({
      candidates: [
        candidate("s1", "a", 90),
        candidate("s1", "b", 90, 1),
        candidate("s2", "c", 90),
        candidate("s2", "d", 90, 1),
      ],
      budget,
    })

    expect(keys(selected)).toEqual(["a", "c"])
  })

  it("skips an oversized payload instead of ending its session", () => {
    const selected = selectGenerationContentWithinBudget({
      candidates: [candidate("s1", "huge", 5_000), candidate("s1", "small", 10, 1), candidate("s1", "next", 10, 2)],
      budget,
    })

    expect(keys(selected)).toEqual(["small", "next"])
  })

  it("stops at the batch total even when per-session budgets remain", () => {
    const selected = selectGenerationContentWithinBudget({
      candidates: Array.from({ length: 20 }, (_, index) => candidate(`s${index}`, `span-${index}`, 100)),
      budget,
    })

    expect(selected).toHaveLength(10)
    expect(selected.reduce((total, item) => total + item.bytes, 0)).toBe(1_000)
  })

  it("selects the same payloads whatever order the candidates arrive in", () => {
    const candidates = [
      candidate("s2", "c", 40, 5),
      candidate("s1", "a", 40, 1),
      candidate("s1", "b", 40, 2),
      candidate("s2", "d", 40, 6),
    ]

    expect(keys(selectGenerationContentWithinBudget({ candidates, budget }))).toEqual(["a", "b", "c", "d"])
    expect(keys(selectGenerationContentWithinBudget({ candidates: [...candidates].reverse(), budget }))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ])
  })
})
