import type { ProjectId, SeedScope } from "@domain/shared/seeding"
import { createSeedScope, SEED_API_KEY_ID, SEED_COST_ARCHETYPE_PROJECTS, SEED_ORG_ID } from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../../sql.ts"
import { isSentinelPresent } from "../../idempotency.ts"
import type { SeedContext, Seeder } from "../../types.ts"
import type { SpanRow } from "../span-builders.ts"
import { buildCohortsSpans, type CostCohort } from "./cohorts.ts"
import { FINDINGS_FIRE_COHORTS } from "./findings-fire.ts"
import { FREE_COHORTS } from "./free.ts"
import { HEALTHY_COHORTS } from "./healthy.ts"
import { REGRESSION_COHORTS } from "./regression.ts"
import { SINGLE_TURN_COHORTS } from "./single-turn.ts"
import { TINY_COHORTS } from "./tiny.ts"

const BATCH_SIZE = 500

/**
 * Every archetype's newest call lands on this instant, and it is stable for a whole
 * day — so re-seeding within the day rewrites identical rows, which the spans table's
 * `ReplacingMergeTree` collapses instead of doubling every cohort.
 */
const archetypeAnchorMs = (scope: SeedScope): number => scope.dateDaysAgo(0).getTime()

const archetypeScope = (ctx: SeedContext, projectId: ProjectId): SeedScope =>
  createSeedScope({
    organizationId: SEED_ORG_ID,
    projectId,
    timelineAnchor: ctx.scope.timelineAnchor,
    apiKeyId: SEED_API_KEY_ID,
  })

const insertSpans = (ctx: SeedContext, spans: readonly SpanRow[]): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    for (let offset = 0; offset < spans.length; offset += BATCH_SIZE) {
      yield* insertJsonEachRow(ctx.client, "spans", spans.slice(offset, offset + BATCH_SIZE))
    }
  })

/**
 * An archetype with a project to itself. The sentinel is the project having any span
 * at all — nothing else writes to these projects, so presence is the whole test. Use
 * `pnpm ch:seed --reset` to refresh a fixture in place.
 */
const ownProjectSeeder = ({
  name,
  projectId,
  cohorts,
}: {
  readonly name: string
  readonly projectId: ProjectId
  readonly cohorts: readonly CostCohort[]
}): Seeder => ({
  name,
  run: (ctx) =>
    Effect.gen(function* () {
      const alreadySeeded = yield* isSentinelPresent(ctx.client, "spans", "project_id = {projectId:String}", {
        projectId,
      })
      if (alreadySeeded) {
        if (!ctx.quiet) console.log(`  -> ${name}: already seeded, skipping`)
        return
      }

      const scope = archetypeScope(ctx, projectId)
      const spans = buildCohortsSpans(cohorts, scope, archetypeAnchorMs(scope))
      yield* insertSpans(ctx, spans)
      if (!ctx.quiet) console.log(`  -> ${name}: ${spans.length} calls across ${cohorts.length} cohorts`)
    }),
})

/**
 * Archetype B rides on the default seed project, which already is the demo project
 * where findings should fire. Its sentinel has to be one of its own span ids rather
 * than the project, which the ambient generator also writes to.
 */
const findingsFireSeeder: Seeder = {
  name: "spans/cost-archetype-b-findings-fire",
  run: (ctx) =>
    Effect.gen(function* () {
      const sentinelSpanId = ctx.scope.spanHex(FINDINGS_FIRE_COHORTS[0]?.key ?? "b-optimal", 0)
      const alreadySeeded = yield* isSentinelPresent(ctx.client, "spans", "span_id = {spanId:String}", {
        spanId: sentinelSpanId,
      })
      if (alreadySeeded) {
        if (!ctx.quiet) console.log("  -> spans/cost-archetype-b-findings-fire: already seeded, skipping")
        return
      }

      const spans = buildCohortsSpans(FINDINGS_FIRE_COHORTS, ctx.scope, archetypeAnchorMs(ctx.scope))
      yield* insertSpans(ctx, spans)
      if (!ctx.quiet) {
        console.log(
          `  -> spans/cost-archetype-b-findings-fire: ${spans.length} calls across ${FINDINGS_FIRE_COHORTS.length} cohorts`,
        )
      }
    }),
}

/**
 * Bootstrap-only QA fixtures for the cost section: six archetypes, each a project
 * whose numbers tell one coherent story. Kept out of `allSeeders` so they never run
 * during runtime demo-project creation.
 */
export const costArchetypeSeeders: readonly Seeder[] = [
  ownProjectSeeder({
    name: "spans/cost-archetype-a-healthy",
    projectId: SEED_COST_ARCHETYPE_PROJECTS.healthy.id,
    cohorts: HEALTHY_COHORTS,
  }),
  findingsFireSeeder,
  ownProjectSeeder({
    name: "spans/cost-archetype-c-single-turn",
    projectId: SEED_COST_ARCHETYPE_PROJECTS.singleTurn.id,
    cohorts: SINGLE_TURN_COHORTS,
  }),
  ownProjectSeeder({
    name: "spans/cost-archetype-d-regression",
    projectId: SEED_COST_ARCHETYPE_PROJECTS.regression.id,
    cohorts: REGRESSION_COHORTS,
  }),
  ownProjectSeeder({
    name: "spans/cost-archetype-e-tiny",
    projectId: SEED_COST_ARCHETYPE_PROJECTS.tiny.id,
    cohorts: TINY_COHORTS,
  }),
  ownProjectSeeder({
    name: "spans/cost-archetype-f-free",
    projectId: SEED_COST_ARCHETYPE_PROJECTS.free.id,
    cohorts: FREE_COHORTS,
  }),
]
