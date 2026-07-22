#!/usr/bin/env tsx
/**
 * Rebuild a local taxonomy calibration dump from ClickHouse — the reproducible
 * version of how the narrow-domain pilot embeddings were pulled (previously an
 * ad-hoc MCP query, documented only in the dump's README).
 *
 * Pulls the observations the live garden actually clusters — embedding +
 * assigned_cluster_id for one project's trailing window, FINAL-deduped,
 * deterministically hash-ordered, capped. Summaries live in a separate table and
 * are not needed for clustering, so they are omitted (each row's `summary` is "").
 * Streams straight to a JSONL file, so embeddings never load into memory at once.
 *
 * Handle the output as CUSTOMER DATA: real embeddings; do not commit or share.
 *
 * Requires read access to production ClickHouse via the standard env vars:
 *   LAT_CLICKHOUSE_URL, LAT_CLICKHOUSE_USER, LAT_CLICKHOUSE_PASSWORD, LAT_CLICKHOUSE_DB
 * (pull them from Secrets Manager or your local prod config).
 *
 *   LAT_CLICKHOUSE_URL=… … pnpm --filter @app/workers exec tsx \
 *     scripts/taxonomy/pull-fresh-pilot.ts [outPath] [projectId] [lookbackDays]
 */
import { createWriteStream } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createClient } from "@clickhouse/client"

const DEFAULT_OUT = join(homedir(), "Desktop/taxonomy-adaptive-pilot-embeddings/narrow-pilot-observations.jsonl")
const DEFAULT_PROJECT_ID = "jwa2e9v5qsp3mvdxfjoy2hju" // narrow-domain ads-analytics pilot
const CAP = 1500 // the production gardening sample cap

const out = process.argv[2] ?? DEFAULT_OUT
const projectId = process.argv[3] ?? DEFAULT_PROJECT_ID
const lookbackDays = Number.parseInt(process.argv[4] ?? "7", 10)

const client = createClient({
  url: process.env.LAT_CLICKHOUSE_URL,
  username: process.env.LAT_CLICKHOUSE_USER,
  password: process.env.LAT_CLICKHOUSE_PASSWORD,
  database: process.env.LAT_CLICKHOUSE_DB ?? "latitude",
})

const query = `
  SELECT observation_id AS observationId,
         assigned_cluster_id AS productionClusterId,
         '' AS summary,
         arrayMap(x -> round(x, 4), embedding) AS embedding
  FROM latitude.taxonomy_observations FINAL
  WHERE project_id = {projectId:String}
    AND length(embedding) = 2048
    AND indexed_at >= now() - INTERVAL {days:UInt32} DAY
  ORDER BY cityHash64(observation_id)
  LIMIT {cap:UInt32}
`

const main = async () => {
  const rs = await client.query({
    query,
    query_params: { projectId, days: lookbackDays, cap: CAP },
    format: "JSONEachRow",
  })
  const stream = createWriteStream(out)
  let count = 0
  const clusters = new Set<string>()
  for await (const rows of rs.stream()) {
    for (const row of rows) {
      const obj = row.json() as { observationId: string; productionClusterId: string; summary: string; embedding: number[] }
      clusters.add(obj.productionClusterId)
      stream.write(`${JSON.stringify(obj)}\n`)
      count++
    }
  }
  await new Promise<void>((resolve) => stream.end(resolve))
  console.log(`wrote ${count} observations (${clusters.size} production clusters) to ${out}`)
  await client.close()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
