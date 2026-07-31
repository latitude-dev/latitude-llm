import type { CostCohort } from "./cohorts.ts"
import { FREE_MODELS } from "./models.ts"

/**
 * Archetype F — total spend $0, and correctly so.
 *
 * Both models are priced at zero in the registry, so every call is `estimated`
 * with no dollars: coverage reads 100% priced, no warning appears, and the total
 * is a real $0 rather than a gap. That is the whole distinction — "unpriced" is a
 * missing price, "free" is a price of zero, and only one of them should caveat the
 * number. It is also the only fixture that exercises the `Free` vocabulary in
 * `rollupCostDisplay`.
 *
 * Caching is off: with no dollars on either side there is no cache economics to
 * reason about, and break-even is undefined, so both rows land on `Not enough data`
 * regardless of call count.
 */
export const FREE_COHORTS: readonly CostCohort[] = FREE_MODELS.map((modelConfig, index) => ({
  key: `free-tier-${index}`,
  serviceName: index === 0 ? "community-chat" : "batch-tagger",
  modelConfig,
  cadence: {
    endDaysAgo: 0,
    clusters: 14,
    clusterSpacingHours: 24,
    callsPerCluster: index === 0 ? 6 : 4,
    gapWithinClusterSeconds: 240,
  },
  cache: { kind: "off" },
  promptTokens: index === 0 ? 2_400 : 5_600,
  completionTokens: index === 0 ? 320 : 90,
  callsPerSession: index === 0 ? 3 : 1,
}))
