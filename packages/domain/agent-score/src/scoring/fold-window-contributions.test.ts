import { SessionId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { LAUNCH_COST_SCORING_ARTIFACT } from "../artifacts/launch-cost-scoring-artifact.ts"
import { PROVISIONAL_COST_METRIC_CATALOG } from "../entities/cost-metric-catalog.ts"
import { unreadableReading } from "../entities/cost-metric-reading.ts"
import type { NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import { aggregateWindowCost, aggregateWindowSpeed } from "./bootstrap-window.ts"
import { EMPTY_WINDOW_FOLD, foldWindowBatch } from "./fold-window-contributions.ts"

describe("foldWindowBatch", () => {
  it("retains readable Speed evidence when Cost is unpublishable", () => {
    const session: NormalizedSessionAssessmentInput = {
      sessionId: SessionId("session-1"),
      hasReadableUserTask: true,
      observedMicrocents: 0,
      observedDurationNs: 1_000,
      findings: [],
      readers: [],
      screeningDecisions: [],
      scoringEligibleSignalIds: [],
      costEvidence: {
        readings: [
          unreadableReading(
            {
              metricId: "cost.recoverable_spend_share",
              family: "spend",
              rawUnit: "microcents",
              aggregation: "resourceRatio",
            },
            ["missingPricing"],
            1_000,
          ),
        ],
        workloadStratum: "test",
        denominators: { spend: 1_000, context: 0, tools: 0, memory: 0, recovery: 0 },
        observedCriticalPathNs: 1_000,
        criticalPathComplete: true,
        measuredAvoidableNs: 250,
        estimatedAvoidableNs: 0,
        measuredAvoidableMicrocents: 0,
        estimatedAvoidableMicrocents: 0,
        avoidableNsByCause: { "latency:throughput": 250 },
      },
    }
    const fold = foldWindowBatch({
      fold: EMPTY_WINDOW_FOLD,
      sessions: [session],
      denominatorsFor: () => ({ spend: 1_000, context: 0, tools: 0, memory: 0, recovery: 0 }),
      artifact: LAUNCH_COST_SCORING_ARTIFACT,
      catalog: PROVISIONAL_COST_METRIC_CATALOG,
    })

    expect(fold).toMatchObject({ foldedSessionCount: 0, withheldSessionCount: 1 })
    expect(fold.contributions).toHaveLength(1)
    expect(fold.contributions[0]?.costUsableForDenominator).toBe(false)
    expect(
      aggregateWindowCost({ contributions: fold.contributions, artifact: LAUNCH_COST_SCORING_ARTIFACT }).cost,
    ).toBe(100)
    expect(aggregateWindowSpeed(fold.contributions)).toMatchObject({ observedNs: 1_000, avoidableNs: 250, speed: 75 })
    expect(fold.speedCauseNs.get("latency:throughput")).toBe(250)
  })
})
