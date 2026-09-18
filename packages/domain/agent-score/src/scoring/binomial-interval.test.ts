import { describe, expect, it } from "vitest"
import { clopperPearsonInterval, regularizedIncompleteBeta } from "./binomial-interval.ts"

describe("regularizedIncompleteBeta", () => {
  it("matches the closed forms at the boundaries", () => {
    expect(regularizedIncompleteBeta(0, 2, 3)).toBe(0)
    expect(regularizedIncompleteBeta(1, 2, 3)).toBe(1)
    // I(x; 1, 1) is the uniform CDF.
    expect(regularizedIncompleteBeta(0.25, 1, 1)).toBeCloseTo(0.25, 12)
  })

  it("agrees with the binomial CDF it is the beta form of", () => {
    // I(x; k, n - k + 1) = P(X >= k) for X ~ Binomial(n, x). n = 5, k = 2, x = 0.5
    // gives 1 - (C(5,0) + C(5,1)) / 2^5 = 1 - 6/32.
    expect(regularizedIncompleteBeta(0.5, 2, 4)).toBeCloseTo(1 - 6 / 32, 12)
  })

  it("stays monotone across the branch switch", () => {
    let previous = 0
    for (let x = 0; x <= 1.0001; x += 0.01) {
      const value = regularizedIncompleteBeta(Math.min(x, 1), 3.5, 7.25)
      expect(value).toBeGreaterThanOrEqual(previous - 1e-12)
      previous = value
    }
    expect(previous).toBeCloseTo(1, 10)
  })
})

describe("clopperPearsonInterval", () => {
  it("brackets the observed rate", () => {
    const interval = clopperPearsonInterval({ successes: 80, trials: 100 })

    expect(interval.lower).toBeLessThan(0.8)
    expect(interval.upper).toBeGreaterThan(0.8)
    // Cross-checked against a direct binomial-tail inversion: the bounds solve
    // P(X >= 80 | p) = 0.025 and P(X <= 80 | p) = 0.025 for n = 100.
    expect(interval.lower).toBeCloseTo(0.70815731, 8)
    expect(interval.upper).toBeCloseTo(0.87334445, 8)
  })

  // The reason this dimension does not use a normal approximation: a window of
  // only successes, or no failures at all, is exactly where one collapses to
  // zero width and reads as certainty.
  it("stays non-degenerate with no observed failures", () => {
    const interval = clopperPearsonInterval({ successes: 20, trials: 20 })

    expect(interval.upper).toBe(1)
    expect(interval.lower).toBeGreaterThan(0)
    expect(interval.lower).toBeLessThan(1)
    // Closed form for an all-success window: the lower bound is (alpha / 2) ^ (1 / n).
    expect(interval.lower).toBeCloseTo(0.025 ** (1 / 20), 6)
  })

  it("stays non-degenerate with no observed successes", () => {
    const interval = clopperPearsonInterval({ successes: 0, trials: 20 })

    expect(interval.lower).toBe(0)
    expect(interval.upper).toBeGreaterThan(0)
    expect(interval.upper).toBeLessThan(1)
  })

  it("narrows as evidence accumulates at a fixed rate", () => {
    const widths = [20, 100, 500].map((trials) => {
      const interval = clopperPearsonInterval({ successes: trials * 0.8, trials })
      return interval.upper - interval.lower
    })

    expect(widths[0]!).toBeGreaterThan(widths[1]!)
    expect(widths[1]!).toBeGreaterThan(widths[2]!)
  })

  it("widens as the confidence level rises", () => {
    const narrow = clopperPearsonInterval({ successes: 40, trials: 50, confidenceLevel: 0.8 })
    const wide = clopperPearsonInterval({ successes: 40, trials: 50, confidenceLevel: 0.99 })

    expect(wide.upper - wide.lower).toBeGreaterThan(narrow.upper - narrow.lower)
  })

  it("returns the whole range when nothing was observed", () => {
    expect(clopperPearsonInterval({ successes: 0, trials: 0 })).toEqual({ lower: 0, upper: 1 })
  })
})
