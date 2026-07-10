import {
  SEED_API_KEY_ID,
  SEED_OLD_TRACES_QA_FROM_DAYS_AGO,
  SEED_OLD_TRACES_QA_PROJECT_ID,
  SEED_OLD_TRACES_QA_TO_DAYS_AGO,
  SEED_ORG_ID,
  type SeedScope,
  TraceId,
} from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import { isSentinelPresent } from "../idempotency.ts"
import type { SeedContext, Seeder, TraceSlot } from "../types.ts"
import { fixedTraceSeeders, fixedTraceSlots } from "./fixed-traces.ts"
import { generateAllSpans, type SpanRow, type TraceConfig } from "./generator.ts"
import { orphanFragmentSeeders, orphanFragmentTraceSlots } from "./orphan-fragments.ts"

const DAY_MS = 24 * 60 * 60 * 1000
const OLD_TRACES_QA_TRACE_COUNT = 150

const TRACE_COUNT = 2000
const BATCH_SIZE = 500

const defaultSpansSeedConfig = (scope: SeedScope): TraceConfig => {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  return {
    traceCount: TRACE_COUNT,
    timeWindow: { from: thirtyDaysAgo, to: now },
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    apiKeyId: scope.apiKeyId,
  }
}

type RunSpansSeedOptions = Partial<TraceConfig> & { readonly quiet?: boolean }

export const runSpansSeed = (
  ctx: SeedContext,
  overrides?: RunSpansSeedOptions,
): Effect.Effect<readonly TraceId[], unknown> =>
  Effect.gen(function* () {
    const quiet = overrides?.quiet ?? false
    const config: TraceConfig = { ...defaultSpansSeedConfig(ctx.scope), ...overrides }

    const allSpans = generateAllSpans(config)
    const traceIds = [...new Set(allSpans.map((s) => s.trace_id))].map((id) => TraceId(id))
    const batchSize = allSpans.length <= BATCH_SIZE ? allSpans.length : BATCH_SIZE

    if (!quiet) {
      console.log(`  -> Generated ${allSpans.length} spans across ${traceIds.length} traces`)
    }

    for (let i = 0; i < allSpans.length; i += batchSize) {
      const batch: SpanRow[] = allSpans.slice(i, i + batchSize)
      yield* insertJsonEachRow(ctx.client, "spans", batch)
      if (!quiet) {
        console.log(`  -> Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allSpans.length / batchSize)}`)
      }
    }

    return traceIds
  })

// QA fixture: spans for the `old-traces-qa` project, all older than the 30-day default window, so
// the project has data but nothing recent. Idempotent — no-ops if the project already has spans.
const oldTracesQaSeeder: Seeder = {
  name: "spans/old-traces-qa",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const alreadySeeded = yield* isSentinelPresent(ctx.client, "spans", "project_id = {projectId:String}", {
        projectId: SEED_OLD_TRACES_QA_PROJECT_ID,
      })
      if (alreadySeeded) {
        if (!ctx.quiet) console.log("  -> spans/old-traces-qa: already seeded, skipping")
        return
      }
      const now = Date.now()
      yield* runSpansSeed(ctx, {
        organizationId: SEED_ORG_ID,
        projectId: SEED_OLD_TRACES_QA_PROJECT_ID,
        apiKeyId: SEED_API_KEY_ID,
        traceCount: OLD_TRACES_QA_TRACE_COUNT,
        timeWindow: {
          from: new Date(now - SEED_OLD_TRACES_QA_FROM_DAYS_AGO * DAY_MS),
          to: new Date(now - SEED_OLD_TRACES_QA_TO_DAYS_AGO * DAY_MS),
        },
        quiet: ctx.quiet ?? false,
      })
    }),
}

export const spanSeeders: Seeder[] = [...fixedTraceSeeders, ...orphanFragmentSeeders, oldTracesQaSeeder]

/**
 * Catalog of every deterministic trace the demo seed writes, as
 * `(traceKey, index)` slots. The ambient `generateAllSpans` traces are not
 * included — they are not part of the demo seed (`allSeeders`).
 */
export const spanTraceSlots: readonly TraceSlot[] = [...fixedTraceSlots, ...orphanFragmentTraceSlots]
