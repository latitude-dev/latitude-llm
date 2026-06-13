import { parseArgs } from "node:util"
import type { RedisClient } from "@platform/cache-redis"
import { closeClickhouse, queryClickhouse } from "@platform/db-clickhouse"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"
import { runTraceSearchRefresh } from "../workers/trace-search.ts"

const DEFAULT_LOOKBACK_DAYS = 7
const DEFAULT_PAGE_SIZE = 2_000
const DEFAULT_CONCURRENCY = 4

function toClickHouseDateTime64String(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "")
}

const USAGE = `
Usage: pnpm --filter @app/workers trace-search:backfill [options]

Defaults:
  - Only traces from the last ${DEFAULT_LOOKBACK_DAYS} days are backfilled
  - Traces are streamed in pages of ${DEFAULT_PAGE_SIZE}; the full result set is never held in memory

Options:
  --organization-id <id>   Restrict backfill to one organization (disables sharding)
  --project-id <id>        Restrict backfill to one project
  --lookback-days <n>      Backfill traces newer than this many days (default: ${DEFAULT_LOOKBACK_DAYS})
  --limit <n>              Process at most this many traces (this shard)
  --concurrency <n>        Number of traces to refresh in parallel (default: ${DEFAULT_CONCURRENCY})
  --page-size <n>          Traces fetched per keyset page (default: ${DEFAULT_PAGE_SIZE})
  --shard-count <n>        Total number of parallel shards (default: 1)
  --shard-index <n>        This process's shard, 0-based (default: 0). Run one process per
                           index 0..shard-count-1; each owns a disjoint set of organizations
                           (cityHash64(organization_id) % shard-count).
  --help                   Show this help
`.trim()

type TraceRow = Record<string, unknown> & {
  readonly organization_id: string
  readonly project_id: string
  readonly trace_id: string
  readonly start_time_ms: number | string
  readonly root_span_name: string
}

type Cursor = {
  readonly startMs: number
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
}

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer, received "${value}"`)
  }

  return parsed
}

function parseNonNegativeInteger(value: string, flagName: string): number {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be a non-negative integer, received "${value}"`)
  }

  return parsed
}

function buildPageQuery(filters: {
  readonly since: string
  readonly cursor: Cursor
  readonly pageSize: number
  readonly organizationId?: string
  readonly projectId?: string
  readonly shardCount: number
  readonly shardIndex: number
}): { readonly query: string; readonly params: Record<string, unknown> } {
  const clauses = ["min_start_time >= toDateTime64({since:String}, 3, 'UTC')"]
  const params: Record<string, unknown> = {
    since: filters.since,
    pageSize: filters.pageSize,
    cursorStartMs: filters.cursor.startMs,
    cursorOrg: filters.cursor.organizationId,
    cursorProject: filters.cursor.projectId,
    cursorTrace: filters.cursor.traceId,
  }

  if (filters.organizationId) {
    clauses.push("organization_id = {organizationId:String}")
    params.organizationId = filters.organizationId
  }

  if (filters.projectId) {
    clauses.push("project_id = {projectId:String}")
    params.projectId = filters.projectId
  }

  // Shard by organization so every trace of an org lands in exactly one shard
  // (occurrence rows are org-scoped; splitting an org across shards would let
  // two processes race on the same trace). Skipped for single-org runs.
  if (!filters.organizationId && filters.shardCount > 1) {
    clauses.push("cityHash64(organization_id) % {shardCount:UInt32} = {shardIndex:UInt32}")
    params.shardCount = filters.shardCount
    params.shardIndex = filters.shardIndex
  }

  return {
    query: `SELECT
              organization_id,
              project_id,
              CAST(trace_id AS String) AS trace_id,
              toUnixTimestamp64Milli(min(min_start_time)) AS start_time_ms,
              argMinIfMerge(root_span_name) AS root_span_name
            FROM traces
            WHERE ${clauses.join(" AND ")}
            GROUP BY organization_id, project_id, trace_id
            HAVING (start_time_ms, organization_id, project_id, trace_id) >
                   ({cursorStartMs:Int64}, {cursorOrg:String}, {cursorProject:String}, {cursorTrace:String})
            ORDER BY start_time_ms ASC, organization_id ASC, project_id ASC, trace_id ASC
            LIMIT {pageSize:UInt32}`,
    params,
  }
}

async function closeRedisClient(redis: RedisClient): Promise<void> {
  await redis.quit().catch(() => undefined)
}

loadDevelopmentEnvironments(new URL("../server.ts", import.meta.url).href)

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "organization-id": { type: "string" },
    "project-id": { type: "string" },
    "lookback-days": { type: "string" },
    limit: { type: "string" },
    concurrency: { type: "string", default: String(DEFAULT_CONCURRENCY) },
    "page-size": { type: "string", default: String(DEFAULT_PAGE_SIZE) },
    "shard-count": { type: "string", default: "1" },
    "shard-index": { type: "string", default: "0" },
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

const concurrency = parsePositiveInteger(values.concurrency ?? String(DEFAULT_CONCURRENCY), "--concurrency")
const pageSize = parsePositiveInteger(values["page-size"] ?? String(DEFAULT_PAGE_SIZE), "--page-size")
const lookbackDays = parsePositiveInteger(values["lookback-days"] ?? String(DEFAULT_LOOKBACK_DAYS), "--lookback-days")
const limit = values.limit ? parsePositiveInteger(values.limit, "--limit") : undefined
const shardCount = parsePositiveInteger(values["shard-count"] ?? "1", "--shard-count")
const shardIndex = parseNonNegativeInteger(values["shard-index"] ?? "0", "--shard-index")

if (shardIndex >= shardCount) {
  console.error(`--shard-index (${shardIndex}) must be less than --shard-count (${shardCount})`)
  process.exit(1)
}

if (values["organization-id"] && shardCount > 1) {
  console.error("--shard-count is ignored when --organization-id is set (a single org is one shard)")
}

const since = toClickHouseDateTime64String(new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000))

const clickhouse = getClickhouseClient()
const redis = getRedisClient()
const postgres = getPostgresClient()

const shardLabel = shardCount > 1 ? `[shard ${shardIndex}/${shardCount}] ` : ""

void Effect.runPromise(
  Effect.gen(function* () {
    let cursor: Cursor = { startMs: -1, organizationId: "", projectId: "", traceId: "" }
    let processed = 0
    let page = 0

    while (true) {
      const remaining = limit === undefined ? undefined : limit - processed
      if (remaining !== undefined && remaining <= 0) break

      const requestedPageSize = remaining === undefined ? pageSize : Math.min(pageSize, remaining)
      const { query, params } = buildPageQuery({
        since,
        cursor,
        pageSize: requestedPageSize,
        ...(values["organization-id"] ? { organizationId: values["organization-id"] } : {}),
        ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
        shardCount,
        shardIndex,
      })

      const rows = yield* queryClickhouse<TraceRow>(clickhouse, query, params)
      if (rows.length === 0) break

      yield* Effect.forEach(
        rows,
        (row) => {
          const startTimeMs = typeof row.start_time_ms === "string" ? Number(row.start_time_ms) : row.start_time_ms
          return runTraceSearchRefresh(
            {
              organizationId: row.organization_id,
              projectId: row.project_id,
              traceId: row.trace_id,
              startTime: new Date(startTimeMs).toISOString(),
              rootSpanName: row.root_span_name,
            },
            { clickhouseClient: clickhouse, postgresClient: postgres, redisClient: redis },
          )
        },
        { concurrency, discard: true },
      )

      processed += rows.length
      page += 1

      const last = rows[rows.length - 1] as TraceRow
      cursor = {
        startMs: typeof last.start_time_ms === "string" ? Number(last.start_time_ms) : last.start_time_ms,
        organizationId: last.organization_id,
        projectId: last.project_id,
        traceId: last.trace_id,
      }

      console.log(
        `${shardLabel}page ${page.toString()}: refreshed ${rows.length.toString()} traces (total ${processed.toString()})`,
      )

      if (rows.length < requestedPageSize) break
    }

    console.log(`${shardLabel}Finished refreshing ${processed.toString()} traces`)
  }).pipe(
    Effect.ensuring(
      Effect.promise(async () => {
        await Promise.allSettled([closeClickhouse(clickhouse), closeRedisClient(redis)])
      }),
    ),
  ),
).catch((error: unknown) => {
  console.error("Trace search backfill failed")
  console.error(error)
  process.exitCode = 1
})
