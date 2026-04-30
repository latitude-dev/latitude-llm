import type { SeedScope } from "@domain/shared/seeding"
import { Effect } from "effect"
import type { WeaviateClient } from "weaviate-client"
import { allSeeders } from "./all.ts"
import { runSeeders } from "./runner.ts"

/**
 * Run every per-project Weaviate seeder against the supplied scope —
 * issue projections, derived from the Postgres issue rows the
 * upstream activity wrote. Used by the runtime "Create Demo Project"
 * Temporal activity. Same code path as `pnpm wv:seed`, just with a
 * fresh-ids `scope` instead of `bootstrapSeedScope`.
 */
export const seedDemoProjectWeaviate = (params: { client: WeaviateClient; scope: SeedScope }): Promise<void> =>
  Effect.runPromise(runSeeders(allSeeders, { client: params.client, scope: params.scope }))
