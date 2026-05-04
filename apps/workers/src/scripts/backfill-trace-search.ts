import { parseArgs } from "node:util"
import type { RedisClient } from "@platform/cache-redis"
import { closeClickhouse, queryClickhouse } from "@platform/db-clickhouse"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"
import { getClickhouseClient, getRedisClient } from "../clients.ts"
import { runTraceSearchRefresh } from "../workers/trace-search.ts"

const USAGE = `
Usage: pnpm --filter @app/workers trace-search:backfill [options]

Options:
  --organization-id <id>   Restrict backfill to one organization
  --project-id <id>        Restrict backfill to one project
  --limit <n>              Process at most this many traces
  --concurrency <n>        Number of traces to process in parallel (default: 4)
  --help                   Show this help
`.trim()

type TraceRow = Record<string, unknown> & {
  readonly organization_id: string
  readonly project_id: string
  readonly trace_id: string
  readonly start_time_ms: number | string
  readonly root_span_name: string
}

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer, received "${value}"`)
  }

  return parsed
}

function buildTraceQuery(filters: {
  readonly organizationId?: string
  readonly projectId?: string
  readonly limit?: number
}): { readonly query: string; readonly params: Record<string, unknown> } {
  const clauses = ["1 = 1"]
  const params: Record<string, unknown> = {}

  if (filters.organizationId) {
    clauses.push("organization_id = {organizationId:String}")
    params.organizationId = filters.organizationId
  }

  if (filters.projectId) {
    clauses.push("project_id = {projectId:String}")
    params.projectId = filters.projectId
  }

  const limitClause = filters.limit !== undefined ? "LIMIT {limit:UInt32}" : ""
  if (filters.limit !== undefined) {
    params.limit = filters.limit
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
            ORDER BY start_time_ms ASC, trace_id ASC
            ${limitClause}`,
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
    limit: { type: "string" },
    concurrency: { type: "string", default: "4" },
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

const concurrency = parsePositiveInteger(values.concurrency ?? "4", "--concurrency")
const limit = values.limit ? parsePositiveInteger(values.limit, "--limit") : undefined

const clickhouse = getClickhouseClient()
const redis = getRedisClient()

void Effect.runPromise(
  Effect.gen(function* () {
    const { query, params } = buildTraceQuery({
      ...(values["organization-id"] ? { organizationId: values["organization-id"] } : {}),
      ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
      ...(limit !== undefined ? { limit } : {}),
    })

    const rows = yield* queryClickhouse<TraceRow>(clickhouse, query, params)

    console.log(`Found ${rows.length.toString()} traces to refresh`)

    yield* Effect.forEach(
      rows,
      (row, index) => {
        const startTimeMs = typeof row.start_time_ms === "string" ? Number(row.start_time_ms) : row.start_time_ms
        const payload = {
          organizationId: row.organization_id,
          projectId: row.project_id,
          traceId: row.trace_id,
          startTime: new Date(startTimeMs).toISOString(),
          rootSpanName: row.root_span_name,
        }

        return runTraceSearchRefresh(payload, {
          clickhouseClient: clickhouse,
          redisClient: redis,
        }).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              console.log(`Refreshed ${index + 1}/${rows.length}: ${row.trace_id}`)
            }),
          ),
        )
      },
      { concurrency, discard: true },
    )

    console.log(`Finished refreshing ${rows.length.toString()} traces`)
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
