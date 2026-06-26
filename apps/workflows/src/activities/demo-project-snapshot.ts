import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { createGunzip } from "node:zlib"
import { type SeedScope, seedTraceHex } from "@domain/shared/seeding"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { demoSeedTraceSlots } from "@platform/db-clickhouse/seeding"
import type { PostgresClient } from "@platform/db-postgres"

const sourceSnapshotDir = fileURLToPath(new URL("../seed-snapshots/demo-project-derived-v1/", import.meta.url))
const bundledSnapshotDir = fileURLToPath(new URL("./seed-snapshots/demo-project-derived-v1/", import.meta.url))
const snapshotDir = existsSync(sourceSnapshotDir) ? sourceSnapshotDir : bundledSnapshotDir

// Keep in sync with apps/workers/src/scripts/export-demo-project-snapshot.ts.
const clickHouseTables = [
  "trace_search_documents",
  "message_embeddings",
  "trace_message_occurrences",
  "session_analyses",
  "session_semantic_moments",
  "session_moment_labels",
  "taxonomy_observations",
] as const

type ClickHouseTable = (typeof clickHouseTables)[number]
type SnapshotRow = Record<string, unknown>

type DemoProjectSnapshotManifest = {
  readonly version: 1
  readonly sourceTimelineAnchorIso: string
  readonly sourceOrganizationId: string
  readonly sourceProjectId: string
  readonly exportedAt: string
}

const timestampColumnsByTable: Record<ClickHouseTable, readonly string[]> = {
  trace_search_documents: ["start_time", "indexed_at"],
  message_embeddings: ["inserted_at"],
  trace_message_occurrences: ["start_time", "indexed_at"],
  session_analyses: ["start_time", "end_time", "indexed_at"],
  session_semantic_moments: ["start_time", "end_time", "indexed_at"],
  session_moment_labels: ["indexed_at"],
  taxonomy_observations: ["start_time", "end_time", "indexed_at"],
}

// Columns holding seeded trace/session ids that the snapshot carries from the
// SOURCE project verbatim. Single-trace sessions key `session_id` by the trace
// id, so session columns go through the same trace-id remap; literal session
// ids (e.g. `seed-large-conversation-1`, `session-anthropic-demo`) aren't in
// the map and pass through unchanged.
const remapColumnsByTable: Record<
  ClickHouseTable,
  { readonly ids: readonly string[]; readonly idArrays: readonly string[] }
> = {
  trace_search_documents: { ids: ["trace_id"], idArrays: [] },
  message_embeddings: { ids: [], idArrays: [] },
  trace_message_occurrences: { ids: ["trace_id", "session_id"], idArrays: [] },
  session_analyses: { ids: ["session_id"], idArrays: ["trace_ids"] },
  session_semantic_moments: { ids: ["trace_id", "session_id"], idArrays: [] },
  session_moment_labels: { ids: ["session_id"], idArrays: [] },
  taxonomy_observations: { ids: ["session_id"], idArrays: [] },
}

const postgresTimestampColumns = new Set([
  "started_at",
  "completed_at",
  "first_observed_at",
  "last_observed_at",
  "clustered_at",
  "created_at",
  "updated_at",
])

const parseManifest = (): DemoProjectSnapshotManifest =>
  JSON.parse(readFileSync(`${snapshotDir}/manifest.json`, "utf8")) as DemoProjectSnapshotManifest

async function* readSnapshotFileRows(fileName: string): AsyncGenerator<SnapshotRow> {
  const lines = createInterface({ input: createReadStream(`${snapshotDir}/${fileName}`).pipe(createGunzip()) })
  for await (const line of lines) {
    if (line.length > 0) yield JSON.parse(line) as SnapshotRow
  }
}

async function* readSnapshotRows(fileName: string): AsyncGenerator<SnapshotRow> {
  const [dir, file] = [fileName.slice(0, fileName.lastIndexOf("/")), fileName.slice(fileName.lastIndexOf("/") + 1)]
  const prefix = file.replace(".jsonl.gz", ".part-")
  const files = readdirSync(`${snapshotDir}/${dir}`)
    .filter((entry) => entry === file || (entry.startsWith(prefix) && entry.endsWith(".jsonl.gz")))
    .sort()

  for (const entry of files) {
    yield* readSnapshotFileRows(`${dir}/${entry}`)
  }
}

const parseTimestamp = (value: string): Date => new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`)

const formatClickHouseTimestamp = (value: unknown, deltaMs: number): unknown => {
  if (typeof value !== "string" || value.length === 0) return value
  const shifted = new Date(parseTimestamp(value).getTime() + deltaMs)
  const decimals = value.match(/\.(\d+)/)?.[1]?.length ?? 3
  const iso = shifted.toISOString()
  const [whole, fraction = ""] = iso.replace("T", " ").replace("Z", "").split(".")
  return decimals === 0 ? whole : `${whole}.${fraction.padEnd(decimals, "0").slice(0, decimals)}`
}

const formatPostgresTimestamp = (value: unknown, deltaMs: number): unknown => {
  if (typeof value !== "string" || value.length === 0) return value
  return new Date(parseTimestamp(value).getTime() + deltaMs).toISOString()
}

const utcDay = (date: Date): number => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())

const mapPath = (path: unknown, mapClusterId: (id: string) => string): unknown => {
  if (typeof path !== "string") return path
  return path
    .split("/")
    .map((segment) => (segment.length === 0 ? segment : mapClusterId(segment)))
    .join("/")
}

const stableId = (prefix: string, sourceId: string, scope: SeedScope): string =>
  scope.cuid(`snapshot:${prefix}:${sourceId}`)

const sha256 = (parts: readonly string[]): string => createHash("sha256").update(parts.join("\0")).digest("hex")

const mapObservationId = (sourceId: unknown, scope: SeedScope): unknown =>
  typeof sourceId === "string"
    ? sha256(["snapshot:taxonomy-observation", scope.projectId, sourceId]).slice(0, 24)
    : sourceId

/**
 * Maps the source project's seeded trace ids onto the target project's. Both
 * are `seedTraceHex(projectId, traceKey, index)`, so regenerating every demo
 * trace slot under each project id yields the source→target translation. The
 * snapshot stores the source project's ids verbatim, while the actual
 * traces/spans are seeded fresh under the target project — without this the
 * imported derived data references traces that don't exist.
 */
export const buildTraceIdRemap = (sourceProjectId: string, targetProjectId: string): ReadonlyMap<string, string> => {
  const remap = new Map<string, string>()
  for (const slot of demoSeedTraceSlots) {
    const source = seedTraceHex(sourceProjectId, slot.traceKey, slot.index)
    const target = seedTraceHex(targetProjectId, slot.traceKey, slot.index)
    if (source !== target) remap.set(source, target)
  }
  return remap
}

const mapClickHouseRow = (
  table: ClickHouseTable,
  row: SnapshotRow,
  input: {
    readonly scope: SeedScope
    readonly deltaMs: number
    readonly mapClusterId: (id: string) => string
    readonly mapRunId: (id: string) => string
    readonly traceIdRemap: ReadonlyMap<string, string>
  },
): SnapshotRow => {
  const mapped: SnapshotRow = { ...row, organization_id: input.scope.organizationId, project_id: input.scope.projectId }
  for (const column of timestampColumnsByTable[table])
    mapped[column] = formatClickHouseTimestamp(mapped[column], input.deltaMs)

  const remapId = (value: unknown): unknown =>
    typeof value === "string" ? (input.traceIdRemap.get(value) ?? value) : value
  const remapColumns = remapColumnsByTable[table]
  for (const column of remapColumns.ids) mapped[column] = remapId(mapped[column])
  for (const column of remapColumns.idArrays)
    if (Array.isArray(mapped[column])) mapped[column] = (mapped[column] as readonly unknown[]).map(remapId)

  if (table === "taxonomy_observations") {
    mapped.observation_id = mapObservationId(mapped.observation_id, input.scope)
    if (typeof mapped.assigned_cluster_id === "string" && mapped.assigned_cluster_id.length > 0) {
      mapped.assigned_cluster_id = input.mapClusterId(mapped.assigned_cluster_id)
    }
    if (typeof mapped.reassignment_run_id === "string" && mapped.reassignment_run_id.length > 0) {
      mapped.reassignment_run_id = input.mapRunId(mapped.reassignment_run_id)
    }
  }

  return mapped
}

const insertClickHouseRows = async (client: ClickHouseClient, table: ClickHouseTable, rows: readonly SnapshotRow[]) => {
  if (rows.length === 0) return
  await client.insert({ table, values: rows, format: "JSONEachRow" })
}

const hardcodedEmbedding = (contentHash: string): readonly number[] => {
  const embedding = Array.from({ length: 2048 }, () => 0)
  const digest = Buffer.from(sha256([contentHash]), "hex")
  for (let i = 0; i < digest.length; i += 2) {
    embedding[digest[i]! % embedding.length] = digest[i + 1]! >= 128 ? 1 : -1
  }
  return embedding
}

const insertHardcodedMessageEmbeddings = async (
  client: ClickHouseClient,
  scope: SeedScope,
  contentHashes: Iterable<string>,
) => {
  const insertedAt = formatClickHouseTimestamp(scope.timelineAnchor.toISOString(), 0)
  const rows = [...contentHashes].map((contentHash) => ({
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    content_hash: contentHash,
    embedding: hardcodedEmbedding(contentHash),
    embedding_model: "voyage-4-large",
    inserted_at: insertedAt,
    retention_days: 30,
  }))

  for (let i = 0; i < rows.length; i += 1000) {
    await insertClickHouseRows(client, "message_embeddings", rows.slice(i, i + 1000))
  }
}

const importClickHouseTable = async (
  client: ClickHouseClient,
  table: ClickHouseTable,
  input: {
    readonly scope: SeedScope
    readonly deltaMs: number
    readonly mapClusterId: (id: string) => string
    readonly mapRunId: (id: string) => string
    readonly traceIdRemap: ReadonlyMap<string, string>
    readonly keep?: (row: SnapshotRow) => boolean
    readonly afterKeep?: (row: SnapshotRow) => void
  },
) => {
  const batch: SnapshotRow[] = []
  for await (const row of readSnapshotRows(`clickhouse/${table}.jsonl.gz`)) {
    if (input.keep && !input.keep(row)) continue
    input.afterKeep?.(row)
    batch.push(mapClickHouseRow(table, row, input))
    if (batch.length >= 1000) {
      await insertClickHouseRows(client, table, batch.splice(0))
    }
  }
  await insertClickHouseRows(client, table, batch)
}

const readPostgresSnapshotRows = async (name: string): Promise<readonly SnapshotRow[]> => {
  const rows: SnapshotRow[] = []
  for await (const row of readSnapshotRows(`postgres/${name}.jsonl.gz`)) rows.push(row)
  return rows
}

const RESET_MUTATION_POLL_INTERVAL_MS = 2_000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type PendingMutation = { readonly table: string; readonly latest_fail_reason: string }

const pendingResetMutations = async (
  client: ClickHouseClient,
  scope: SeedScope,
): Promise<readonly PendingMutation[]> => {
  const resultSet = await client.query({
    query: `SELECT table, latest_fail_reason
            FROM system.mutations
            WHERE table IN ({tables:Array(String)})
              AND command LIKE {predicate:String}
              AND is_done = 0`,
    query_params: { tables: [...clickHouseTables], predicate: `%project_id = '${scope.projectId}'%` },
    format: "JSONEachRow",
  })
  return resultSet.json<PendingMutation>()
}

const projectRowExists = async (
  client: ClickHouseClient,
  table: ClickHouseTable,
  scope: SeedScope,
): Promise<boolean> => {
  const resultSet = await client.query({
    query: `SELECT 1 FROM ${table}
            WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}
            LIMIT 1`,
    query_params: { organizationId: scope.organizationId, projectId: scope.projectId },
    format: "JSONEachRow",
  })
  return (await resultSet.json()).length > 0
}

/**
 * The reset only exists to keep Temporal retries / re-seeds idempotent — a
 * freshly created demo project has no rows here, and these tables are all
 * ReplacingMergeTree keyed by `(organization_id, project_id, …)` with
 * deterministic snapshot rows, so a re-insert dedups on its own. So we delete
 * only from tables that actually hold rows for this project. `(organization_id,
 * project_id)` is the primary-key prefix on every table, making the existence
 * check an index point-lookup; on the common fresh-project path all checks
 * come back empty and no mutation runs at all.
 *
 * When a delete is warranted, `ALTER TABLE … DELETE` is a heavyweight mutation
 * that rewrites parts and can run for minutes. Awaiting it with
 * `mutations_sync: "2"` holds the HTTP request open with no data flowing, so
 * the client's 30s `request_timeout` trips the socket and the activity fails
 * every retry. Instead we submit the mutations without waiting and poll
 * `system.mutations` with short queries until they complete, letting the
 * activity's 30-minute start-to-close timeout be the real budget.
 */
const resetClickHouse = async (client: ClickHouseClient, scope: SeedScope) => {
  const presence = await Promise.all(
    clickHouseTables.map(async (table) => ({ table, hasRows: await projectRowExists(client, table, scope) })),
  )
  const tablesToReset = presence.filter((entry) => entry.hasRows).map((entry) => entry.table)
  if (tablesToReset.length === 0) return

  for (const table of tablesToReset) {
    await client.command({
      query: `ALTER TABLE ${table} DELETE WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}`,
      query_params: { organizationId: scope.organizationId, projectId: scope.projectId },
      clickhouse_settings: { mutations_sync: "0" },
    })
  }

  for (;;) {
    const pending = await pendingResetMutations(client, scope)
    const failed = pending.find((mutation) => mutation.latest_fail_reason.length > 0)
    if (failed) {
      throw new Error(`Demo seed reset mutation failed on ${failed.table}: ${failed.latest_fail_reason}`)
    }
    if (pending.length === 0) return
    await sleep(RESET_MUTATION_POLL_INTERVAL_MS)
  }
}

const resetPostgres = async (client: PostgresClient, scope: SeedScope) => {
  const params = [scope.organizationId, scope.projectId]
  await client.pool.query(
    "DELETE FROM latitude.taxonomy_cluster_lineage WHERE organization_id = $1 AND project_id = $2",
    params,
  )
  await client.pool.query(
    "DELETE FROM latitude.taxonomy_clusters WHERE organization_id = $1 AND project_id = $2",
    params,
  )
  await client.pool.query("DELETE FROM latitude.taxonomy_runs WHERE organization_id = $1 AND project_id = $2", params)
}

const mapPostgresRow = (row: SnapshotRow, scope: SeedScope, deltaMs: number, extra: SnapshotRow): SnapshotRow => {
  const mapped: SnapshotRow = { ...row, ...extra, organization_id: scope.organizationId, project_id: scope.projectId }
  for (const column of postgresTimestampColumns) mapped[column] = formatPostgresTimestamp(mapped[column], deltaMs)
  return mapped
}

const insertTaxonomyRuns = async (
  client: PostgresClient,
  rows: readonly SnapshotRow[],
  scope: SeedScope,
  deltaMs: number,
  mapRunId: (id: string) => string,
) => {
  for (const row of rows) {
    const mapped = mapPostgresRow(row, scope, deltaMs, { id: mapRunId(String(row.id)), trigger: "manual" })
    await client.pool.query(
      `INSERT INTO latitude.taxonomy_runs
       (id, organization_id, project_id, trigger, status, started_at, completed_at, observations_scanned, noise_scanned,
        clusters_born, clusters_merged, clusters_deprecated, error, observations_available, observations_sampled,
        sample_strategy, sample_cap)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        mapped.id,
        mapped.organization_id,
        mapped.project_id,
        mapped.trigger,
        mapped.status,
        mapped.started_at,
        mapped.completed_at,
        mapped.observations_scanned,
        mapped.noise_scanned,
        mapped.clusters_born,
        mapped.clusters_merged,
        mapped.clusters_deprecated,
        mapped.error,
        mapped.observations_available,
        mapped.observations_sampled,
        mapped.sample_strategy,
        mapped.sample_cap,
      ],
    )
  }
}

const insertTaxonomyClusters = async (
  client: PostgresClient,
  rows: readonly SnapshotRow[],
  scope: SeedScope,
  deltaMs: number,
  mapClusterId: (id: string) => string,
) => {
  for (const row of rows) {
    const mapped = mapPostgresRow(row, scope, deltaMs, {
      id: mapClusterId(String(row.id)),
      parent_cluster_id: typeof row.parent_cluster_id === "string" ? mapClusterId(row.parent_cluster_id) : null,
      merged_into_cluster_id:
        typeof row.merged_into_cluster_id === "string" ? mapClusterId(row.merged_into_cluster_id) : null,
      path: mapPath(row.path, mapClusterId),
    })
    await client.pool.query(
      `INSERT INTO latitude.taxonomy_clusters
       (id, organization_id, project_id, parent_cluster_id, depth, path, split_link_threshold, name, description,
        centroid, centroid_embedding, observation_count, state, merged_into_cluster_id, first_observed_at,
        last_observed_at, clustered_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::vector,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        mapped.id,
        mapped.organization_id,
        mapped.project_id,
        mapped.parent_cluster_id,
        mapped.depth,
        mapped.path,
        mapped.split_link_threshold,
        mapped.name,
        mapped.description,
        mapped.centroid,
        mapped.centroid_embedding,
        mapped.observation_count,
        mapped.state,
        mapped.merged_into_cluster_id,
        mapped.first_observed_at,
        mapped.last_observed_at,
        mapped.clustered_at,
        mapped.created_at,
        mapped.updated_at,
      ],
    )
  }
}

const insertTaxonomyLineage = async (
  client: PostgresClient,
  rows: readonly SnapshotRow[],
  scope: SeedScope,
  deltaMs: number,
  mapClusterId: (id: string) => string,
  mapRunId: (id: string) => string,
) => {
  for (const row of rows) {
    const mapped = mapPostgresRow(row, scope, deltaMs, {
      id: stableId("taxonomy-lineage", String(row.id), scope),
      run_id: mapRunId(String(row.run_id)),
      from_cluster_ids: Array.isArray(row.from_cluster_ids)
        ? row.from_cluster_ids.map((id) => mapClusterId(String(id)))
        : [],
      to_cluster_ids: Array.isArray(row.to_cluster_ids) ? row.to_cluster_ids.map((id) => mapClusterId(String(id))) : [],
    })
    await client.pool.query(
      `INSERT INTO latitude.taxonomy_cluster_lineage
       (id, organization_id, project_id, run_id, transition_type, from_cluster_ids, to_cluster_ids, similarity, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        mapped.id,
        mapped.organization_id,
        mapped.project_id,
        mapped.run_id,
        mapped.transition_type,
        mapped.from_cluster_ids,
        mapped.to_cluster_ids,
        mapped.similarity,
        mapped.created_at,
      ],
    )
  }
}

export const importDemoProjectDerivedSnapshot = async (input: {
  readonly postgresClient: PostgresClient
  readonly clickhouseClient: ClickHouseClient
  readonly scope: SeedScope
}) => {
  const manifest = parseManifest()
  const deltaMs = utcDay(input.scope.timelineAnchor) - utcDay(new Date(manifest.sourceTimelineAnchorIso))
  const mapClusterId = (id: string) => stableId("taxonomy-cluster", id, input.scope)
  const mapRunId = (id: string) => stableId("taxonomy-run", id, input.scope)
  const traceIdRemap = buildTraceIdRemap(manifest.sourceProjectId, input.scope.projectId)

  await resetClickHouse(input.clickhouseClient, input.scope)
  await resetPostgres(input.postgresClient, input.scope)

  await insertTaxonomyRuns(
    input.postgresClient,
    await readPostgresSnapshotRows("taxonomy_runs"),
    input.scope,
    deltaMs,
    mapRunId,
  )
  await insertTaxonomyClusters(
    input.postgresClient,
    await readPostgresSnapshotRows("taxonomy_clusters"),
    input.scope,
    deltaMs,
    mapClusterId,
  )
  await insertTaxonomyLineage(
    input.postgresClient,
    await readPostgresSnapshotRows("taxonomy_cluster_lineage"),
    input.scope,
    deltaMs,
    mapClusterId,
    mapRunId,
  )

  const traceIds = new Set<string>()
  const contentHashes = new Set<string>()
  const analysisKeys = new Set<string>()
  const momentKeys = new Set<string>()
  const analysisKey = (row: SnapshotRow) => `${String(row.session_id)}\0${String(row.analysis_hash)}`
  const momentKey = (row: SnapshotRow) =>
    `${String(row.session_id)}\0${String(row.analysis_hash)}\0${String(row.moment_id)}`

  await importClickHouseTable(input.clickhouseClient, "trace_search_documents", {
    scope: input.scope,
    deltaMs,
    mapClusterId,
    mapRunId,
    traceIdRemap,
    // Import a trace's derived data only if that trace is in the seeded slice
    // (`traceIdRemap` is keyed by the seeded source trace ids). A blind row
    // limit here would pick traces spread across the full corpus, most of which
    // aren't seeded under the target project — leaving their sessions pointing
    // at non-existent traces (the permanent-skeleton bug this fix exists for).
    keep: (row) => traceIdRemap.has(String(row.trace_id)),
    afterKeep: (row) => traceIds.add(String(row.trace_id)),
  })
  await importClickHouseTable(input.clickhouseClient, "trace_message_occurrences", {
    scope: input.scope,
    deltaMs,
    mapClusterId,
    mapRunId,
    traceIdRemap,
    keep: (row) => traceIds.has(String(row.trace_id)),
    afterKeep: (row) => contentHashes.add(String(row.content_hash)),
  })
  await insertHardcodedMessageEmbeddings(input.clickhouseClient, input.scope, contentHashes)
  await importClickHouseTable(input.clickhouseClient, "session_analyses", {
    scope: input.scope,
    deltaMs,
    mapClusterId,
    mapRunId,
    traceIdRemap,
    keep: (row) => Array.isArray(row.trace_ids) && row.trace_ids.some((traceId) => traceIds.has(String(traceId))),
    afterKeep: (row) => analysisKeys.add(analysisKey(row)),
  })
  await importClickHouseTable(input.clickhouseClient, "session_semantic_moments", {
    scope: input.scope,
    deltaMs,
    mapClusterId,
    mapRunId,
    traceIdRemap,
    keep: (row) => traceIds.has(String(row.trace_id)) && analysisKeys.has(analysisKey(row)),
    afterKeep: (row) => momentKeys.add(momentKey(row)),
  })
  await importClickHouseTable(input.clickhouseClient, "session_moment_labels", {
    scope: input.scope,
    deltaMs,
    mapClusterId,
    mapRunId,
    traceIdRemap,
    keep: (row) => momentKeys.has(momentKey(row)),
  })
  await importClickHouseTable(input.clickhouseClient, "taxonomy_observations", {
    scope: input.scope,
    deltaMs,
    mapClusterId,
    mapRunId,
    traceIdRemap,
    // Behaviours read sessions from here; keep only observations whose session
    // is a seeded single-trace session (`session_id` is the trace id), so every
    // behaviour's "associated session" resolves to a real seeded trace.
    keep: (row) =>
      typeof row.assigned_cluster_id === "string" &&
      row.assigned_cluster_id.length > 0 &&
      traceIdRemap.has(String(row.session_id)),
  })
}
