import { bootstrapSeedScope } from "@domain/shared/seeding"
import { describe, expect, it } from "vitest"
import { buildAgentScoreHistorySpans } from "./agent-score-history.ts"

const spans = buildAgentScoreHistorySpans(bootstrapSeedScope)

const sessionsOf = (rows: typeof spans) => {
  const bySession = new Map<string, typeof spans>()
  for (const span of rows) {
    bySession.set(span.session_id, [...(bySession.get(span.session_id) ?? []), span])
  }
  return bySession
}

describe("the Agent Score history fixture", () => {
  it("rebuilds identically, so a re-seed replaces its rows instead of doubling them", () => {
    const again = buildAgentScoreHistorySpans(bootstrapSeedScope)

    expect(again.map((span) => span.span_id)).toEqual(spans.map((span) => span.span_id))
    expect(new Set(spans.map((span) => span.span_id)).size).toBe(spans.length)
  })

  it("encloses every span of a turn in its own agent envelope", () => {
    // A child outside its parent makes the critical path incomplete, which withholds the session
    // from Speed entirely rather than merely costing it coverage.
    for (const [, sessionSpans] of sessionsOf(spans)) {
      const root = sessionSpans.find((span) => span.operation === "invoke_agent")
      expect(root).toBeDefined()
      for (const child of sessionSpans.filter((span) => span !== root)) {
        expect(child.parent_span_id).toBe(root?.span_id)
        expect(child.start_time >= (root?.start_time as string)).toBe(true)
        expect(child.end_time <= (root?.end_time as string)).toBe(true)
      }
    }
  })

  it("ends a failing session on an assistant turn with nothing in it", () => {
    const failing = [...sessionsOf(spans).values()].filter((sessionSpans) =>
      sessionSpans.some((span) => span.error_type === "EmptyCompletion"),
    )

    expect(failing.length).toBeGreaterThan(0)
    for (const sessionSpans of failing) {
      const generations = sessionSpans.filter((span) => span.operation === "chat")
      const final = generations.at(-1)
      expect(JSON.parse(final?.output_messages as string)).toEqual([
        { role: "assistant", parts: [{ type: "text", content: "" }] },
      ])
    }
  })

  it("spreads a fortnight of published dates across a month of settled traffic", () => {
    const days = new Set(spans.map((span) => span.start_time.slice(0, 10)))

    expect(days.size).toBeGreaterThanOrEqual(44)
  })

  it("states streaming and first-token timing rather than sampling them", () => {
    for (const span of spans.filter((row) => row.operation === "chat")) {
      expect(span.is_streaming).toBe(1)
      expect(span.time_to_first_token_ns).toBeGreaterThan(0)
    }
  })
})
