import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import type { Seeder } from "../types.ts"
import { type SpanRow, type TraceConfig, generateAllSpans } from "./generator.ts"

const TRACE_COUNT = 2000
const BATCH_SIZE = 500

const ORG_ID = "iapkf6osmlm7mbw9kulosua4"
const PROJECT_ID = "yvl1e78evmwfs2mosyjb08rc"
const API_KEY_ID = "v42lqe92hgq2hpvilg91brnt"

const seedSpans: Seeder = {
  name: "spans",
  run: (ctx) =>
    Effect.gen(function* () {
      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      const config: TraceConfig = {
        traceCount: TRACE_COUNT,
        timeWindow: { from: thirtyDaysAgo, to: now },
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        apiKeyId: API_KEY_ID,
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
