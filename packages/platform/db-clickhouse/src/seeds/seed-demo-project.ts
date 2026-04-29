import type { ClickHouseClient } from "@clickhouse/client"
import type { SeedScope } from "@domain/shared/seeding"
import { Effect } from "effect"
import { allSeeders } from "./all.ts"
import { runSeeders } from "./runner.ts"

/**
 * Run every per-project ClickHouse seeder against the supplied scope —
 * spans (ambient + deterministic), score-mirror, dataset rows. Used by
 * the runtime "Create Demo Project" Temporal activity. Same code path
 * as `pnpm ch:seed`, just with a fresh-ids `scope` instead of
 * `bootstrapSeedScope`.
 */
export const seedDemoProjectClickHouse = (params: { client: ClickHouseClient; scope: SeedScope }): Promise<void> =>
  Effect.runPromise(runSeeders(allSeeders, { client: params.client, scope: params.scope }))
