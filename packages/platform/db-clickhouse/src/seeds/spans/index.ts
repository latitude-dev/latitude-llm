import { SEED_API_KEY_ID, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import type { Seeder } from "../types.ts"
import { type SpanRow, type TraceConfig, generateAllSpans } from "./generator.ts"

const TRACE_COUNT = 2000
const BATCH_SIZE = 500

const seedSpans: Seeder = {
  name: "spans",
  run: (ctx) =>
    Effect.gen(function* () {
      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      const config: TraceConfig = {
        traceCount: TRACE_COUNT,
        timeWindow: { from: thirtyDaysAgo, to: now },
        organizationId: SEED_ORG_ID,
        projectId: SEED_PROJECT_ID,
        apiKeyId: SEED_API_KEY_ID,
      }

      const allSpans = generateAllSpans(config)
      const traceCount = new Set(allSpans.map((s) => s.trace_id)).size

      console.log(`  -> Generated ${allSpans.length} spans across ${traceCount} traces`)

      for (let i = 0; i < allSpans.length; i += BATCH_SIZE) {
        const batch: SpanRow[] = allSpans.slice(i, i + BATCH_SIZE)
        yield* insertJsonEachRow(ctx.client, "spans", batch)
        console.log(`  -> Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allSpans.length / BATCH_SIZE)}`)
      }
    }),
}

export const spanSeeders: Seeder[] = [seedSpans]
