import { describe, expect, it } from "vitest"
import {
  decomposeCostPerSession,
  SESSION_COST_MIN_SESSIONS,
  type SessionCostFactor,
  type SessionCostModelSlice,
  type SessionCostPeriod,
} from "./decompose-cost-per-session.ts"

const model = (
  name: string,
  { tokens, pricePerToken }: { tokens: number; pricePerToken: number },
): SessionCostModelSlice => ({
  provider: "openai",
  model: name,
  tokens,
  costMicrocents: tokens * pricePerToken,
})

/** A period built from the factors themselves, so a test can move exactly one of them. */
const period = ({
  sessions,
  turnsPerSession,
  stepsPerTurn,
  tokensPerStep,
  models,
  traceKeyedSessions = 0,
}: {
  sessions: number
  turnsPerSession: number
  stepsPerTurn: number
  tokensPerStep: number
  models: readonly { name: string; share: number; pricePerToken: number }[]
  traceKeyedSessions?: number
}): SessionCostPeriod => {
  const turns = sessions * turnsPerSession
  const steps = turns * stepsPerTurn
  const tokens = steps * tokensPerStep
  const slices = models.map((entry) =>
    model(entry.name, { tokens: tokens * entry.share, pricePerToken: entry.pricePerToken }),
  )
  return {
    sessions,
    traceKeyedSessions,
    turns,
    steps,
    tokens,
    costMicrocents: slices.reduce((sum, slice) => sum + slice.costMicrocents, 0),
    unpricedCalls: 0,
    models: slices,
  }
}

const CHEAP = { name: "gpt-5-mini", share: 1, pricePerToken: 10 }

const BASELINE = {
  sessions: 400,
  turnsPerSession: 3,
  stepsPerTurn: 2,
  tokensPerStep: 1_000,
  models: [CHEAP],
} as const

const pointsFor = (rows: readonly { factor: SessionCostFactor; points: number }[], factor: SessionCostFactor): number =>
  rows.find((row) => row.factor === factor)?.points ?? 0

const factors = (rows: readonly { factor: SessionCostFactor }[]): readonly SessionCostFactor[] =>
  rows.map((row) => row.factor)

describe("decomposeCostPerSession", () => {
  it("attributes a pure turn-count rise entirely to turns per session", () => {
    const result = decomposeCostPerSession({
      previous: period(BASELINE),
      current: period({ ...BASELINE, turnsPerSession: 6 }),
    })

    expect(result.status).toBe("ok")
    expect(result.totalPoints).toBe(100)
    expect(pointsFor(result.rows, "turnsPerSession")).toBe(100)
    expect(pointsFor(result.rows, "tokensPerStep")).toBe(0)
    expect(pointsFor(result.rows, "stepsPerTurn")).toBe(0)
    expect(pointsFor(result.rows, "modelMix")).toBe(0)
    expect(pointsFor(result.rows, "pricePerToken")).toBe(0)
  })

  it("attributes prompt growth to tokens per step, not to the price rows", () => {
    const result = decomposeCostPerSession({
      previous: period(BASELINE),
      current: period({ ...BASELINE, tokensPerStep: 4_000 }),
    })

    expect(pointsFor(result.rows, "tokensPerStep")).toBe(result.totalPoints)
    expect(pointsFor(result.rows, "modelMix")).toBe(0)
    expect(pointsFor(result.rows, "pricePerToken")).toBe(0)
  })

  it("puts a migration to a cheaper model on the model mix row, not on price per token", () => {
    const previous = period({
      ...BASELINE,
      models: [
        { name: "claude-opus", share: 0.8, pricePerToken: 100 },
        { name: "claude-haiku", share: 0.2, pricePerToken: 10 },
      ],
    })
    const current = period({
      ...BASELINE,
      models: [
        { name: "claude-opus", share: 0.2, pricePerToken: 100 },
        { name: "claude-haiku", share: 0.8, pricePerToken: 10 },
      ],
    })
    const result = decomposeCostPerSession({ previous, current })

    expect(result.totalPoints).toBeLessThan(0)
    expect(pointsFor(result.rows, "modelMix")).toBe(result.totalPoints)
    // Nothing repriced, so the within-model rate row has nothing to carry.
    expect(pointsFor(result.rows, "pricePerToken")).toBe(0)
  })

  it("puts a list-price rise on price per token, not on model mix", () => {
    const result = decomposeCostPerSession({
      previous: period(BASELINE),
      current: period({ ...BASELINE, models: [{ ...CHEAP, pricePerToken: 20 }] }),
    })

    expect(pointsFor(result.rows, "pricePerToken")).toBe(result.totalPoints)
    expect(pointsFor(result.rows, "modelMix")).toBe(0)
  })

  it("separates a mix shift from a simultaneous prompt-growth rise", () => {
    const previous = period({
      ...BASELINE,
      models: [
        { name: "cheap", share: 0.9, pricePerToken: 10 },
        { name: "premium", share: 0.1, pricePerToken: 100 },
      ],
    })
    const current = period({
      ...BASELINE,
      tokensPerStep: 2_000,
      models: [
        { name: "cheap", share: 0.5, pricePerToken: 10 },
        { name: "premium", share: 0.5, pricePerToken: 100 },
      ],
    })
    const result = decomposeCostPerSession({ previous, current })

    expect(pointsFor(result.rows, "modelMix")).toBeGreaterThan(0)
    expect(pointsFor(result.rows, "tokensPerStep")).toBeGreaterThan(0)
    expect(pointsFor(result.rows, "turnsPerSession")).toBe(0)
    expect(pointsFor(result.rows, "stepsPerTurn")).toBe(0)
  })

  it("sums every row to the headline total, for any combination of moves", () => {
    const cases = [
      { turnsPerSession: 3.7, stepsPerTurn: 2.3, tokensPerStep: 1_311, price: 13 },
      { turnsPerSession: 2.9, stepsPerTurn: 1.1, tokensPerStep: 907, price: 7 },
      { turnsPerSession: 3.01, stepsPerTurn: 2.02, tokensPerStep: 1_003, price: 10.1 },
      { turnsPerSession: 11, stepsPerTurn: 5, tokensPerStep: 40_000, price: 91 },
    ]

    for (const shape of cases) {
      const result = decomposeCostPerSession({
        previous: period(BASELINE),
        current: period({
          sessions: 517,
          turnsPerSession: shape.turnsPerSession,
          stepsPerTurn: shape.stepsPerTurn,
          tokensPerStep: shape.tokensPerStep,
          models: [{ ...CHEAP, pricePerToken: shape.price }],
        }),
      })

      const summed = result.rows.reduce((sum, row) => sum + row.points, 0)
      expect(summed, JSON.stringify(shape)).toBe(result.totalPoints)
      expect(result.totalPoints).toBe(Math.round(result.changePct ?? 0))
    }
  })

  it("absorbs the rounding residual into the largest contribution", () => {
    // Three factors each land on a .5-ish share of a total that does not divide evenly.
    const result = decomposeCostPerSession({
      previous: period(BASELINE),
      current: period({ ...BASELINE, turnsPerSession: 3.31, stepsPerTurn: 2.07, tokensPerStep: 1_013 }),
    })

    expect(result.rows.reduce((sum, row) => sum + row.points, 0)).toBe(result.totalPoints)
    const largest = result.rows[0]
    expect(largest?.factor).toBe("turnsPerSession")
  })

  it("orders rows by absolute contribution so the cause reads first", () => {
    const result = decomposeCostPerSession({
      previous: period(BASELINE),
      current: period({ ...BASELINE, turnsPerSession: 3.3, tokensPerStep: 3_000 }),
    })

    const magnitudes = result.rows.map((row) => Math.abs(row.points))
    expect(magnitudes).toEqual([...magnitudes].sort((a, b) => b - a))
    expect(result.rows[0]?.factor).toBe("tokensPerStep")
  })

  it("reports flat rather than dividing by a near-zero log", () => {
    const previous = period(BASELINE)
    const result = decomposeCostPerSession({ previous, current: { ...previous, sessions: previous.sessions } })

    expect(result.status).toBe("flat")
    expect(result.rows).toEqual([])
    expect(result.changePct).toBe(0)
    expect(result.totalPoints).toBe(0)
  })

  it("refuses to compare when either period is under the session floor", () => {
    const small = period({ ...BASELINE, sessions: SESSION_COST_MIN_SESSIONS - 1 })
    const big = period({ ...BASELINE, turnsPerSession: 6 })

    expect(decomposeCostPerSession({ previous: small, current: big }).status).toBe("notEnoughData")
    expect(decomposeCostPerSession({ previous: big, current: small }).status).toBe("notEnoughData")
    expect(decomposeCostPerSession({ previous: small, current: big }).changePct).toBeNull()
  })

  it("refuses to compare when the previous period recorded no spend", () => {
    const free = period({ ...BASELINE, models: [{ ...CHEAP, pricePerToken: 0 }] })
    const paid = period(BASELINE)

    const result = decomposeCostPerSession({ previous: free, current: paid })
    expect(result.status).toBe("notEnoughData")
    expect(result.rows).toEqual([])
    // The headline still renders — only the comparison is withheld.
    expect(result.currentCostPerSessionMicrocents).toBeGreaterThan(0)
  })

  it("reports the session-count change without letting it move a row", () => {
    const result = decomposeCostPerSession({
      previous: period(BASELINE),
      current: period({ ...BASELINE, sessions: BASELINE.sessions * 2 }),
    })

    expect(result.volume).toEqual({ previousSessions: 400, currentSessions: 800 })
    expect(result.status).toBe("flat")
  })

  it("baselines a model with no previous tokens at the previous blended price", () => {
    const previous = period({ ...BASELINE, models: [{ name: "cheap", share: 1, pricePerToken: 10 }] })
    const current = period({
      ...BASELINE,
      models: [
        { name: "cheap", share: 0.5, pricePerToken: 10 },
        { name: "brand-new", share: 0.5, pricePerToken: 10 },
      ],
    })
    const result = decomposeCostPerSession({ previous, current })

    // Routing half the traffic somewhere priced identically is not a mix effect.
    expect(result.status).toBe("flat")
  })

  it("only emits a cache efficiency row once an effect is supplied", () => {
    const previous = period(BASELINE)
    const current = period({ ...BASELINE, models: [{ ...CHEAP, pricePerToken: 20 }] })

    expect(factors(decomposeCostPerSession({ previous, current }).rows)).not.toContain("cacheEfficiency")

    const withCache = decomposeCostPerSession({ previous, current, cacheEfficiencyEffect: 5 })
    expect(factors(withCache.rows)).toContain("cacheEfficiency")
    expect(withCache.rows.reduce((sum, row) => sum + row.points, 0)).toBe(withCache.totalPoints)
    // Half the 10-microcent price rise was handed to caching, so it takes half the points.
    expect(pointsFor(withCache.rows, "cacheEfficiency")).toBe(pointsFor(withCache.rows, "pricePerToken"))
  })

  it("carries the before and after values for the volume factors only", () => {
    const result = decomposeCostPerSession({
      previous: period(BASELINE),
      current: period({ ...BASELINE, turnsPerSession: 6, models: [{ ...CHEAP, pricePerToken: 20 }] }),
    })

    expect(result.rows.find((row) => row.factor === "turnsPerSession")?.values).toEqual({ previous: 3, current: 6 })
    expect(result.rows.find((row) => row.factor === "modelMix")?.values).toBeNull()
    expect(result.rows.find((row) => row.factor === "pricePerToken")?.values).toBeNull()
  })
})
