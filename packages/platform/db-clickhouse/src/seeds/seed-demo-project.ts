import type { ClickHouseClient } from "@clickhouse/client"
import type { SeedScope } from "@domain/shared/seeding"
import { Effect } from "effect"
import { allSeeders } from "./all.ts"
import { runSeeders } from "./runner.ts"
import { spanTraceSlots } from "./spans/index.ts"
import type { TraceSlot } from "./types.ts"

export type { TraceSlot } from "./types.ts"

/**
 * How many tau2 trajectories the demo seed writes. The full corpus has 1568,
 * but the demo only needs a representative slice — capping keeps sample-project
 * provisioning fast. The snapshot import selects derived data for exactly this
 * seeded slice (via {@link demoSeedTraceSlots}), so both must use this same cap.
 */
export const DEMO_TAU2_TRAJECTORY_LIMIT = 300

/**
 * Every deterministic trace the demo seed *actually* writes, as
 * `(traceKey, index)` slots — i.e. `spanTraceSlots` with the tau2 trajectories
 * capped to {@link DEMO_TAU2_TRAJECTORY_LIMIT}, matching `maxTau2Trajectories`
 * below. Consumed by the demo-project snapshot import both to remap the source
 * project's trace/session ids onto the freshly seeded project's ids and to
 * select which derived rows to import: a derived row whose trace isn't in this
 * set has no seeded trace to point at, so importing it would resurrect the
 * permanent-skeleton bug.
 */
export const demoSeedTraceSlots: readonly TraceSlot[] = spanTraceSlots.filter(
  (slot) => slot.traceKey !== "tau2-trajectory" || slot.index < DEMO_TAU2_TRAJECTORY_LIMIT,
)

/**
 * Run every per-project ClickHouse seeder against the supplied scope —
 * spans (ambient + deterministic), score-mirror, dataset rows. Used by
 * the runtime "Create Demo Project" Temporal activity. Same code path
 * as `pnpm ch:seed`, just with a fresh-ids `scope` instead of
 * `bootstrapSeedScope`.
 */
export const seedDemoProjectClickHouse = (params: { client: ClickHouseClient; scope: SeedScope }): Promise<void> =>
  Effect.runPromise(
    runSeeders(allSeeders, {
      client: params.client,
      scope: params.scope,
      maxTau2Trajectories: DEMO_TAU2_TRAJECTORY_LIMIT,
    }),
  )
