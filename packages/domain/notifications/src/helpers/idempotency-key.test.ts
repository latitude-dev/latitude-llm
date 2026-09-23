import { describe, expect, it } from "vitest"
import type { AgentScoreWeeklyDigestPayload } from "../entities/notification.ts"
import { buildIdempotencyKey } from "./idempotency-key.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const digestPayload = (overrides: Partial<AgentScoreWeeklyDigestPayload> = {}): AgentScoreWeeklyDigestPayload => ({
  projectId: cuid("p"),
  date: "2026-09-21",
  windowStart: "2026-09-16",
  windowEnd: "2026-09-22",
  score: 71,
  interval: { lower: 68, upper: 74 },
  scoringVersion: "agent-score-v5-provisional",
  windowDays: 7,
  eligibleSessionCount: 312,
  publishedDayCount: 5,
  series: [{ date: "2026-09-21", score: 71 }],
  dimensions: {
    outcome: { score: 74, delta: null },
    reliability: { score: 81, delta: null },
    cost: { score: 66, delta: null },
    speed: { score: 70, delta: null },
    safety: { score: 92, delta: null },
  },
  comparison: { status: "none" },
  ...overrides,
})

describe("buildIdempotencyKey for agent-score.weekly-digest", () => {
  it("separates two projects digesting the same week", () => {
    const first = buildIdempotencyKey({
      kind: "agent-score.weekly-digest",
      payload: digestPayload({ projectId: cuid("pa") }),
    })
    const second = buildIdempotencyKey({
      kind: "agent-score.weekly-digest",
      payload: digestPayload({ projectId: cuid("pb") }),
    })

    expect(first).not.toBe(second)
  })

  it("holds steady when a retry finds a newer snapshot inside the same week", () => {
    const monday = buildIdempotencyKey({ kind: "agent-score.weekly-digest", payload: digestPayload() })
    const retried = buildIdempotencyKey({
      kind: "agent-score.weekly-digest",
      payload: digestPayload({ date: "2026-09-22", score: 73 }),
    })

    expect(retried).toBe(monday)
  })

  it("moves on to the next week", () => {
    const thisWeek = buildIdempotencyKey({ kind: "agent-score.weekly-digest", payload: digestPayload() })
    const nextWeek = buildIdempotencyKey({
      kind: "agent-score.weekly-digest",
      payload: digestPayload({ windowStart: "2026-09-23", windowEnd: "2026-09-29" }),
    })

    expect(nextWeek).not.toBe(thisWeek)
  })
})

describe("buildIdempotencyKey for a manual agent-score.weekly-digest send", () => {
  const key = (overrides: Partial<AgentScoreWeeklyDigestPayload> = {}) =>
    buildIdempotencyKey({ kind: "agent-score.weekly-digest", payload: digestPayload(overrides) })

  it("is never swallowed by the week's digest from the weekly job", () => {
    expect(key({ manualRequestId: cuid("m1") })).not.toBe(key())
  })

  it("keeps two manual sends of the same week apart", () => {
    expect(key({ manualRequestId: cuid("m1") })).not.toBe(key({ manualRequestId: cuid("m2") }))
  })

  it("still dedupes a retry of the same manual send into itself", () => {
    expect(key({ manualRequestId: cuid("m1") })).toBe(key({ manualRequestId: cuid("m1") }))
  })

  it("leaves the weekly job's key exactly as it was", () => {
    expect(key()).toBe(`agent-score.weekly-digest:${cuid("p")}:2026-09-22`)
  })
})
