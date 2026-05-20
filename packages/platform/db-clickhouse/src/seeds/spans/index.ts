import { type SeedScope, TraceId } from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import { isSentinelPresent } from "../idempotency.ts"
import type { SeedContext, Seeder } from "../types.ts"
import { fixedTraceSeeders } from "./fixed-traces.ts"
import { generateAllSpans, type SpanRow, type TraceConfig } from "./generator.ts"

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

const seedSpans: Seeder = {
  name: "spans/generated-ambient-telemetry",
  run: (ctx) =>
    Effect.gen(function* () {
      // Sentinel: any span carrying the ambient-seed marker. The generator
      // produces random trace_ids per run, so we identify its footprint by
      // `metadata['seed']` (set in generator.ts + session-generator.ts).
      const present = yield* isSentinelPresent(ctx.client, "spans", "metadata['seed'] = 'ambient-generated'", {})
      if (present) {
        if (!ctx.quiet) console.log("  -> spans/generated-ambient-telemetry: already seeded, skipping")
        return
      }
      yield* runSpansSeed(ctx)
    }),
}

export const spanSeeders: Seeder[] = [...fixedTraceSeeders, seedSpans]
