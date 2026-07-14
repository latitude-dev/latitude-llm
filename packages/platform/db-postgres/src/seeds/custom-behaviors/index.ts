import { CUSTOM_BEHAVIOR_QA_COHORT_LIST } from "@domain/shared/seed-content/custom-behavior-qa"
import { Effect } from "effect"
import { customBehaviors } from "../../schema/custom-behaviors.ts"
import type { SeedContext, Seeder } from "../types.ts"

// Bootstrap-only QA fixture (LAT-752): two generatable custom behaviors on the
// seed project, one scoped by `user_id`, one by `service_names`. Their filter
// sets match the cohorts the ClickHouse seeder injects into
// `taxonomy_observations`, so both preview ≥15 observations and generate a
// scoped tree. Kept out of `contentSeeders` so runtime demo-project creation
// never provisions them.
const seedCustomBehaviorsQa: Seeder = {
  name: "custom-behaviors/qa",
  run: (ctx: SeedContext) =>
    Effect.tryPromise({
      try: async () => {
        for (const cohort of CUSTOM_BEHAVIOR_QA_COHORT_LIST) {
          await ctx.db
            .insert(customBehaviors)
            .values({
              id: ctx.scope.cuid(cohort.idKey),
              organizationId: ctx.scope.organizationId,
              projectId: ctx.scope.projectId,
              name: cohort.name,
              slug: cohort.slug,
              filterSet: cohort.filterSet,
              status: "pending",
            })
            .onConflictDoNothing({ target: customBehaviors.id })
        }
        console.log(`  -> custom-behaviors/qa: ${CUSTOM_BEHAVIOR_QA_COHORT_LIST.length} QA custom behaviors`)
      },
      catch: (cause) => new Error(`custom-behaviors/qa seed failed: ${String(cause)}`),
    }),
}

export const customBehaviorQaSeeders: readonly Seeder[] = [seedCustomBehaviorsQa]
