import { SEED_API_KEY_ID, SEED_ORG_ID, SEED_PROJECT_ID, TraceId } from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import type { SeedContext, Seeder } from "../types.ts"
import { fixedTraceSeeders } from "./fixed-traces.ts"
import { generateAllSpans, type SpanRow, type TraceConfig } from "./generator.ts"

const TRACE_COUNT = 2000
const BATCH_SIZE = 500

const defaultSpansSeedConfig = (): TraceConfig => {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  return {
    traceCount: TRACE_COUNT,
    timeWindow: { from: thirtyDaysAgo, to: now },
    organizationId: SEED_ORG_ID,
    projectId: SEED_PROJECT_ID,
    apiKeyId: SEED_API_KEY_ID,
  }
}

type RunSpansSeedOptions = Partial<TraceConfig> & { readonly quiet?: boolean }

export const runSpansSeed = (
  ctx: SeedContext,
  overrides?: RunSpansSeedOptions,
): Effect.Effect<readonly TraceId[], unknown> =>
  Effect.gen(function* () {
    const quiet = overrides?.quiet ?? false
    const config: TraceConfig = { ...defaultSpansSeedConfig(), ...overrides }

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
  run: (ctx) => runSpansSeed(ctx),
}

export const spanSeeders: Seeder[] = [...fixedTraceSeeders, seedSpans]
