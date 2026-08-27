import { describe, expect, it } from "vitest"
import { AGENT_SCORE_SNAPSHOTS, apdexDimensions } from "./agent-score-mock.ts"

/**
 * The mock's whole claim is that its arithmetic is the spec's arithmetic, so these guard the
 * relationships a reviewer would otherwise have to check by hand.
 */
describe("agent score fixtures", () => {
  for (const snapshot of AGENT_SCORE_SNAPSHOTS) {
    describe(snapshot.key, () => {
      const scored = snapshot.score !== null

      it("has deficits that add up to the score", () => {
        if (!scored) return
        const total =
          snapshot.dimensions.reduce((sum, dimension) => sum + (dimension.deficit ?? 0), 0) + snapshot.safety.deficit
        expect(100 - total).toBeCloseTo(snapshot.score as number, 1)
      })

      it("reproduces each Apdex sub-score from its bucket counts", () => {
        for (const dimension of apdexDimensions(snapshot)) {
          if (dimension.subScore === null || !dimension.buckets) continue
          const { ruined, degraded, clean, denominator } = dimension.buckets
          expect(ruined + degraded + clean).toBe(denominator)
          expect(((clean + degraded / 2) / denominator) * 100).toBeCloseTo(dimension.subScore, 0)
        }
      })

      it("splits each dimension's deficit into shares that sum back to it", () => {
        for (const dimension of apdexDimensions(snapshot)) {
          if (dimension.deficit === null) continue
          const shares = dimension.causes.reduce((sum, cause) => sum + (cause.share ?? 0), 0)
          expect(shares).toBeCloseTo(dimension.deficit, 1)
        }
      })

      it("keeps every gain under the dimension's deficit, and their sum under it too", () => {
        for (const dimension of apdexDimensions(snapshot)) {
          if (dimension.deficit === null) continue
          const gains = dimension.causes.reduce((sum, cause) => sum + (cause.gain ?? 0), 0)
          expect(gains).toBeLessThanOrEqual(dimension.deficit)
          for (const cause of dimension.causes) {
            expect(cause.gain ?? 0).toBeLessThanOrEqual(dimension.deficit)
          }
        }
      })

      it("derives efficiency from its applicable curves", () => {
        const efficiency = snapshot.dimensions.find((dimension) => dimension.kind === "curves")
        if (!efficiency || efficiency.kind !== "curves" || efficiency.subScore === null) return
        const applicable = efficiency.metrics.filter((metric) => metric.curve !== null)
        const mean = applicable.reduce((sum, metric) => sum + (metric.curve ?? 0), 0) / applicable.length
        expect(mean * 100).toBeCloseTo(efficiency.subScore, 0)
        const metricDeficits = applicable.reduce((sum, metric) => sum + (metric.deficit ?? 0), 0)
        expect(metricDeficits).toBeCloseTo(efficiency.deficit ?? 0, 1)
      })

      it("is the weighted mean of the dimensions that were measured", () => {
        if (!scored) return
        const measured = snapshot.dimensions.filter((dimension) => dimension.subScore !== null)
        const weightSum = measured.reduce((sum, dimension) => sum + dimension.weight, 0)
        const weighted = measured.reduce((sum, dimension) => sum + dimension.weight * (dimension.subScore ?? 0), 0)
        expect(weighted / weightSum).toBeCloseTo(snapshot.uncappedScore as number, 0)
        for (const dimension of measured) {
          expect(dimension.effectiveWeight ?? 0).toBeCloseTo(dimension.weight / weightSum, 2)
        }
      })

      it("prices the safety cap as the gap between the uncapped and capped score", () => {
        if (!snapshot.safety.isBinding) {
          expect(snapshot.safety.deficit).toBe(0)
          return
        }
        expect((snapshot.uncappedScore as number) - (snapshot.score as number)).toBeCloseTo(snapshot.safety.deficit, 1)
      })
    })
  }
})
