import {
  SEED_API_KEY_ID,
  SEED_CANONICAL_TRACE_IDS,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_SIMULATION_ID,
  TraceId,
} from "@domain/shared"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import type { SeedContext, Seeder } from "../types.ts"
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

/**
 * Remap the first N distinct generated trace ids to {@link SEED_CANONICAL_TRACE_IDS} so Postgres
 * score and annotation-queue seeds reference real ClickHouse traces.
 */
function remapToCanonicalTraceIds(spans: SpanRow[], config: TraceConfig): void {
  const shouldRemap =
    config.organizationId === SEED_ORG_ID &&
    config.projectId === SEED_PROJECT_ID &&
    config.simulationId === undefined &&
    config.traceCount >= SEED_CANONICAL_TRACE_IDS.length

  if (!shouldRemap || spans.length === 0) return

  const orderedUnique: string[] = []
  const seen = new Set<string>()
  for (const row of spans) {
    if (seen.has(row.trace_id)) continue
    seen.add(row.trace_id)
    orderedUnique.push(row.trace_id)
    if (orderedUnique.length >= SEED_CANONICAL_TRACE_IDS.length) break
  }

  const remap = new Map<string, string>()
  for (let i = 0; i < orderedUnique.length && i < SEED_CANONICAL_TRACE_IDS.length; i++) {
    const from = orderedUnique[i]
    const to = SEED_CANONICAL_TRACE_IDS[i]
    if (from !== undefined && to !== undefined) {
      remap.set(from, to)
    }
  }

  for (const row of spans) {
    const next = remap.get(row.trace_id)
    if (next !== undefined) {
      row.trace_id = next
    }
  }
}

export const runSpansSeed = (
  ctx: SeedContext,
  overrides?: RunSpansSeedOptions,
): Effect.Effect<readonly TraceId[], unknown> =>
  Effect.gen(function* () {
    const quiet = overrides?.quiet ?? false
    const config: TraceConfig = { ...defaultSpansSeedConfig(), ...overrides }

    const allSpans = generateAllSpans(config)
    remapToCanonicalTraceIds(allSpans, config)
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

const SIMULATION_TRACE_COUNT = 20

const seedSpans: Seeder = {
  name: "spans",
  run: (ctx) => runSpansSeed(ctx),
}

const seedSimulationSpans: Seeder = {
  name: "spans/simulation-linked",
  run: (ctx) =>
    runSpansSeed(ctx, {
      traceCount: SIMULATION_TRACE_COUNT,
      simulationId: SEED_SIMULATION_ID,
      quiet: true,
    }).pipe(
      Effect.tap((traceIds) =>
        Effect.sync(() =>
          console.log(
            `  -> spans/simulation-linked: ${SIMULATION_TRACE_COUNT} traces linked to seed simulation (${traceIds.length} trace ids)`,
          ),
        ),
      ),
      Effect.asVoid,
    ),
}

export const spanSeeders: Seeder[] = [seedSpans, seedSimulationSpans]
