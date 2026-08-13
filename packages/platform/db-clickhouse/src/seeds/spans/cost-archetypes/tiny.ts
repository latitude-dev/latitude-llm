import type { CostCohort } from "./cohorts.ts"
import { GEMINI_2_5_FLASH_LITE } from "./models.ts"

/**
 * Archetype E — a few traces, days old. Cheap, and it catches a whole class of
 * divide-by-something-small bugs: every sample floor, `Not enough data` on the
 * cache table (9 calls against a floor of 20), the empty states on panels with
 * nothing to draw, and the completed-days-only daily average measured against a
 * window whose last day is still in progress.
 */
export const TINY_COHORTS: readonly CostCohort[] = [
  {
    key: "tiny-onboarding",
    serviceName: "first-agent",
    modelConfig: GEMINI_2_5_FLASH_LITE,
    cadence: { endDaysAgo: 0, clusters: 3, clusterSpacingHours: 24, callsPerCluster: 3, gapWithinClusterSeconds: 90 },
    cache: { kind: "prefixReuse", share: 0.8 },
    promptTokens: 3_100,
    completionTokens: 240,
    callsPerSession: 3,
  },
]
