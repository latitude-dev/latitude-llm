import { describe, expect, it } from "vitest"
import { attributeDeficit, EXACT_ATTRIBUTION_CAUSE_LIMIT } from "./attribute-deficit.ts"

/** A dimension whose causes each cost a fixed number of points and never interact. */
const additive = (costs: Readonly<Record<string, number>>) => ({
  causeIds: Object.keys(costs),
  healthyScore: 100,
  scoreWith: (active: ReadonlySet<string>) =>
    100 - [...active].reduce((total, causeId) => total + (costs[causeId] ?? 0), 0),
  observedScore: 100 - Object.values(costs).reduce((total, cost) => total + cost, 0),
})

describe("attributeDeficit", () => {
  it("gives each cause exactly what it cost when causes do not interact", () => {
    const result = attributeDeficit(additive({ cache: 5, retries: 3, thrashing: 2 }))

    expect(result.causes.find((cause) => cause.causeId === "cache")?.attributedDeficit).toBeCloseTo(5, 9)
    expect(result.causes.find((cause) => cause.causeId === "retries")?.attributedDeficit).toBeCloseTo(3, 9)
    expect(result.causes.find((cause) => cause.causeId === "thrashing")?.attributedDeficit).toBeCloseTo(2, 9)
  })

  it("closes: the shares and the residual account for the whole deficit", () => {
    const result = attributeDeficit(additive({ cache: 5, retries: 3, thrashing: 2 }))
    const attributed = result.causes.reduce((total, cause) => total + cause.attributedDeficit, 0)

    expect(attributed + result.residual).toBeCloseTo(result.totalDeficit, 9)
  })

  it("splits a deficit two causes are each sufficient for, instead of crediting one", () => {
    // Both fail the same sessions: removing either alone changes nothing, removing both recovers 10.
    const result = attributeDeficit({
      causeIds: ["provider-error", "tool-failure"],
      healthyScore: 100,
      scoreWith: (active) => (active.size === 0 ? 100 : 90),
      observedScore: 90,
    })

    expect(result.causes[0]?.attributedDeficit).toBeCloseTo(5, 9)
    expect(result.causes[1]?.attributedDeficit).toBeCloseTo(5, 9)
  })

  it("reports a zero fix gain for a cause that is individually redundant", () => {
    const result = attributeDeficit({
      causeIds: ["provider-error", "tool-failure"],
      healthyScore: 100,
      scoreWith: (active) => (active.size === 0 ? 100 : 90),
      observedScore: 90,
    })

    // Removing one leaves the other failing the same sessions, so nothing is recovered.
    expect(result.causes.every((cause) => cause.fixGain === 0)).toBe(true)
  })

  it("keeps fix gains separate from shares, because they overlap and shares do not", () => {
    const result = attributeDeficit({
      causeIds: ["a", "b"],
      healthyScore: 100,
      scoreWith: (active) => (active.size === 0 ? 100 : 80),
      observedScore: 80,
    })
    const gains = result.causes.reduce((total, cause) => total + cause.fixGain, 0)
    const shares = result.causes.reduce((total, cause) => total + cause.attributedDeficit, 0)

    expect(shares).toBeCloseTo(20, 9)
    expect(gains).not.toBeCloseTo(shares, 6)
  })

  it("returns a cause's own fix gain when it is the only thing failing those sessions", () => {
    const result = attributeDeficit(additive({ cache: 5, retries: 3 }))

    expect(result.causes.find((cause) => cause.causeId === "cache")?.fixGain).toBeCloseTo(5, 9)
  })

  it("respects a cap, so two causes past it share the capped deficit rather than doubling it", () => {
    const result = attributeDeficit({
      causeIds: ["a", "b"],
      healthyScore: 100,
      scoreWith: (active) => 100 - Math.min(10, [...active].length * 8),
      observedScore: 90,
    })
    const attributed = result.causes.reduce((total, cause) => total + cause.attributedDeficit, 0)

    expect(attributed).toBeCloseTo(10, 9)
    expect(result.causes[0]?.attributedDeficit).toBeCloseTo(5, 9)
  })

  it("puts everything in the residual when no cause was named", () => {
    const result = attributeDeficit({
      causeIds: [],
      healthyScore: 100,
      scoreWith: () => 100,
      observedScore: 70,
    })

    expect(result).toMatchObject({ causes: [], residual: 30, totalDeficit: 30 })
  })

  it("leaves deficit the named causes cannot explain in the residual", () => {
    const result = attributeDeficit({
      causeIds: ["cache"],
      healthyScore: 100,
      scoreWith: (active) => (active.has("cache") ? 95 : 100),
      // Five points of the deficit belong to something nobody fitted a cause to.
      observedScore: 90,
    })

    expect(result.causes[0]?.attributedDeficit).toBeCloseTo(5, 9)
    expect(result.residual).toBeCloseTo(5, 9)
  })

  it("never reports a negative share or a negative gain", () => {
    const result = attributeDeficit({
      causeIds: ["helpful"],
      healthyScore: 100,
      scoreWith: (active) => (active.has("helpful") ? 100 : 90),
      observedScore: 100,
    })

    expect(result.causes[0]?.attributedDeficit).toBeGreaterThanOrEqual(0)
    expect(result.causes[0]?.fixGain).toBeGreaterThanOrEqual(0)
  })
})

describe("attribution at scale", () => {
  const manyCauses = (count: number) =>
    Object.fromEntries(Array.from({ length: count }, (_, index) => [`cause-${index}`, index % 4]))

  it("stays exact at the cause limit", () => {
    const result = attributeDeficit(additive(manyCauses(EXACT_ATTRIBUTION_CAUSE_LIMIT)))

    expect(result.method).toBe("exact")
    expect(result.approximationError).toBeUndefined()
  })

  it("samples past the limit and reports how far the shares might still move", () => {
    const result = attributeDeficit(additive(manyCauses(EXACT_ATTRIBUTION_CAUSE_LIMIT + 3)))

    expect(result.method).toBe("sampled")
    expect(result.approximationError).toBeGreaterThanOrEqual(0)
  })

  it("lands near the exact answer when it samples", () => {
    const costs = manyCauses(EXACT_ATTRIBUTION_CAUSE_LIMIT + 3)
    const result = attributeDeficit(additive(costs))

    for (const [causeId, cost] of Object.entries(costs)) {
      expect(result.causes.find((cause) => cause.causeId === causeId)?.attributedDeficit).toBeCloseTo(cost, 6)
    }
  })

  it("reproduces itself from the same seed", () => {
    const input = additive(manyCauses(EXACT_ATTRIBUTION_CAUSE_LIMIT + 5))

    expect(attributeDeficit({ ...input, seed: 9 }).causes).toEqual(attributeDeficit({ ...input, seed: 9 }).causes)
  })

  it("honours the permutation ceiling so a wide cause list cannot stall the job", () => {
    const result = attributeDeficit({
      ...additive(manyCauses(20)),
      maxPermutations: 40,
      errorTarget: 0,
    })

    expect(result.evaluations).toBeLessThanOrEqual(40 * 21)
  })
})
