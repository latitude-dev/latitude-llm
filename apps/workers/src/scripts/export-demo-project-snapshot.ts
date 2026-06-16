import { createWriteStream, mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { parseArgs } from "node:util"
import { createGzip } from "node:zlib"
import { closeClickhouse, queryClickhouse } from "@platform/db-clickhouse"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"
import { getAdminPostgresClient, getClickhouseClient } from "../clients.ts"

const DEFAULT_ORGANIZATION_ID = "iapkf6osmlm7mbw9kulosua4"
const DEFAULT_PROJECT_ID = "yvl1e78evmwfs2mosyjb08rc"
const DEFAULT_OUTPUT_DIR = "../../apps/workflows/src/seed-snapshots/demo-project-derived-v1"
const DEFAULT_SOURCE_TIMELINE_ANCHOR_ISO = "2026-06-16T12:00:00.000Z"

const clickHouseTables = [
  "trace_search_documents",
  "message_embeddings",
  "trace_message_occurrences",
  "session_analyses",
  "session_semantic_moments",
  "session_moment_labels",
  "taxonomy_observations",
] as const

const USAGE = `
Usage: pnpm --filter @app/workers demo-project-snapshot:export [options]

Options:
  --organization-id <id>       Source organization id (default: ${DEFAULT_ORGANIZATION_ID})
  --project-id <id>            Source project id (default: ${DEFAULT_PROJECT_ID})
  --source-timeline-anchor-iso Snapshot timestamp anchor used for replay shifting
                               (default: ${DEFAULT_SOURCE_TIMELINE_ANCHOR_ISO})
  --output-dir <path>          Output snapshot directory (default: ${DEFAULT_OUTPUT_DIR})
  --help                       Show this help
`.trim()

type SnapshotRow = Record<string, unknown>

loadDevelopmentEnvironments(new URL("../server.ts", import.meta.url).href)

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "organization-id": { type: "string", default: DEFAULT_ORGANIZATION_ID },
    "project-id": { type: "string", default: DEFAULT_PROJECT_ID },
    "source-timeline-anchor-iso": { type: "string", default: DEFAULT_SOURCE_TIMELINE_ANCHOR_ISO },
    "output-dir": { type: "string", default: DEFAULT_OUTPUT_DIR },
    help: { type: "boolean", default: false },
  },
})

if (values.help) {
  console.log(USAGE)
  process.exit(0)
}

if (positionals.length > 0) {
  console.error(`Unexpected positional arguments: ${positionals.join(" ")}`)
  console.log(USAGE)
  process.exit(1)
}

const organizationId = values["organization-id"] ?? DEFAULT_ORGANIZATION_ID
const projectId = values["project-id"] ?? DEFAULT_PROJECT_ID
const outputDir = resolve(values["output-dir"] ?? DEFAULT_OUTPUT_DIR)
const clickhouse = getClickhouseClient()
const postgres = getAdminPostgresClient()

const writeRows = async (path: string, rows: Iterable<SnapshotRow>) => {
  mkdirSync(dirname(path), { recursive: true })
  const gzip = createGzip()
  const stream = createWriteStream(path)
  gzip.pipe(stream)
  let count = 0
  for (const row of rows) {
    if (!gzip.write(`${JSON.stringify(row)}\n`)) await new Promise((resolve) => gzip.once("drain", resolve))
    count += 1
  }
  gzip.end()
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", resolve)
    stream.on("error", reject)
    gzip.on("error", reject)
  })
  return count
}

const writeRowsChunked = async (path: string, rows: readonly SnapshotRow[], chunkSize: number) => {
  if (rows.length <= chunkSize) return writeRows(path, rows)
  let count = 0
  for (let index = 0; index < rows.length; index += chunkSize) {
    const part = Math.floor(index / chunkSize)
      .toString()
      .padStart(3, "0")
    count += await writeRows(path.replace(".jsonl.gz", `.part-${part}.jsonl.gz`), rows.slice(index, index + chunkSize))
  }
  return count
}

const readClickHouseTable = (table: (typeof clickHouseTables)[number]) =>
  Effect.runPromise(
    queryClickhouse<SnapshotRow>(
      clickhouse,
      `SELECT * FROM ${table} FINAL WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}`,
      { organizationId, projectId },
    ),
  )

const readPostgresRows = async () => {
  const params = [organizationId, projectId]
  const [taxonomyRuns, taxonomyClusters, taxonomyClusterLineage] = await Promise.all([
    postgres.pool.query<SnapshotRow>(
      `SELECT id, organization_id, project_id, trigger, status, started_at, completed_at, observations_scanned,
              noise_scanned, clusters_born, clusters_merged, clusters_deprecated, error, observations_available,
              observations_sampled, sample_strategy, sample_cap
       FROM latitude.taxonomy_runs
       WHERE organization_id = $1 AND project_id = $2
       ORDER BY started_at, id`,
      params,
    ),
    postgres.pool.query<SnapshotRow>(
      `SELECT id, organization_id, project_id, parent_cluster_id, depth, path, split_link_threshold, name, description,
              centroid, centroid_embedding::text, observation_count, state, merged_into_cluster_id,
              first_observed_at, last_observed_at, clustered_at, created_at, updated_at
       FROM latitude.taxonomy_clusters
       WHERE organization_id = $1 AND project_id = $2
       ORDER BY depth, path, id`,
      params,
    ),
    postgres.pool.query<SnapshotRow>(
      `SELECT id, organization_id, project_id, run_id, transition_type, from_cluster_ids, to_cluster_ids, similarity, created_at
       FROM latitude.taxonomy_cluster_lineage
       WHERE organization_id = $1 AND project_id = $2
       ORDER BY created_at, id`,
      params,
    ),
  ])

  return {
    taxonomy_runs: taxonomyRuns.rows,
    taxonomy_clusters: taxonomyClusters.rows,
    taxonomy_cluster_lineage: taxonomyClusterLineage.rows,
  }
}

try {
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(
    `${outputDir}/manifest.json`,
    `${JSON.stringify(
      {
        version: 1,
        sourceTimelineAnchorIso: values["source-timeline-anchor-iso"] ?? DEFAULT_SOURCE_TIMELINE_ANCHOR_ISO,
        sourceOrganizationId: organizationId,
        sourceProjectId: projectId,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  )

  for (const table of clickHouseTables) {
    const rows = await readClickHouseTable(table)
    const count = await writeRowsChunked(
      `${outputDir}/clickhouse/${table}.jsonl.gz`,
      rows,
      table === "message_embeddings" ? 5000 : rows.length,
    )
    console.log(`${table}: ${count.toString()} rows`)
  }

  const postgresRows = await readPostgresRows()
  for (const [name, rows] of Object.entries(postgresRows)) {
    const count = await writeRows(`${outputDir}/postgres/${name}.jsonl.gz`, rows)
    console.log(`${name}: ${count.toString()} rows`)
  }

  console.log(`Wrote ${outputDir}`)
} finally {
  await Promise.allSettled([postgres.pool.end(), closeClickhouse(clickhouse)])
}
