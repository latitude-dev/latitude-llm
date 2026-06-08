import { parseArgs } from "node:util"
import { type OrganizationId as OrganizationIdType, ProjectId } from "@domain/shared"
import { SessionRepository } from "@domain/spans"
import { closeClickhouse, SessionRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { loadDevelopmentEnvironments } from "@repo/utils/env"
import { Effect } from "effect"
import {
  getAdminPostgresClient,
  getClickhouseClient,
  getPostgresClient,
  getRedisClient,
  getWorkflowStarter,
} from "../clients.ts"
import { runGardenProjectJob } from "../workers/taxonomy.ts"

const DEFAULT_LIMIT_PER_PROJECT = 200

const USAGE = `
Usage: pnpm --filter @app/workers conversation-intelligence:backfill [options]

Starts Temporal AnalyzeSessionWorkflow runs for materialized ClickHouse sessions.

Options:
  --organization-id <id>   Restrict backfill to one organization
  --project-id <id>        Restrict backfill to one project
  --limit <n>              Process at most this many sessions per project (default: ${DEFAULT_LIMIT_PER_PROJECT})
  --concurrency <n>        Number of workflow starts to process in parallel (default: 2)
  --reset                  Clear existing conversation-intelligence rows for selected projects first
  --reset-taxonomy         Clear taxonomy graph rows for selected projects before processing
  --garden-after           Wait for started analyses to finish, then run GardenTaxonomyWorkflow
  --rebase-observations-to-now
                           Rewrite observation timestamps into the current gardening lookback window before gardening
  --manual-reprocess       Use AnalyzeSessionWorkflow reason 'manual_reprocess' instead of 'backfill'
  --help                   Show this help
`.trim()

type ProjectRow = {
  readonly organization_id: string
  readonly project_id: string
}

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${flagName} must be a positive integer, received "${value}"`)
  return parsed
}

async function listProjects(filters: { readonly organizationId?: string; readonly projectId?: string }) {
  const adminPostgres = getAdminPostgresClient()
  const clauses = ["deleted_at IS NULL"]
  const values: string[] = []
  if (filters.organizationId) {
    values.push(filters.organizationId)
    clauses.push(`organization_id = $${values.length}`)
  }
  if (filters.projectId) {
    values.push(filters.projectId)
    clauses.push(`id = $${values.length}`)
  }
  const result = await adminPostgres.pool.query<ProjectRow>(
    `SELECT organization_id, id AS project_id FROM latitude.projects WHERE ${clauses.join(" AND ")} ORDER BY organization_id, id`,
    values,
  )
  return result.rows
}

async function resetProjectTaxonomy(project: ProjectRow) {
  const adminPostgres = getAdminPostgresClient()
  const params = [project.organization_id, project.project_id]
  await adminPostgres.pool.query(
    `DELETE FROM latitude.taxonomy_cluster_lineage WHERE organization_id = $1 AND project_id = $2`,
    params,
  )
  await adminPostgres.pool.query(
    `DELETE FROM latitude.taxonomy_clusters WHERE organization_id = $1 AND project_id = $2`,
    params,
  )
  await adminPostgres.pool.query(
    `DELETE FROM latitude.taxonomy_runs WHERE organization_id = $1 AND project_id = $2`,
    params,
  )
}

async function resetProjectConversationIntelligence(project: ProjectRow) {
  const clickhouse = getClickhouseClient()
  const params = { organizationId: project.organization_id, projectId: project.project_id }
  for (const table of [
    "session_moment_labels",
    "session_semantic_moments",
    "taxonomy_observations",
    "session_analyses",
  ] as const) {
    await clickhouse.command({
      query: `ALTER TABLE ${table} DELETE WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}`,
      query_params: params,
      clickhouse_settings: { mutations_sync: "2" },
    })
    await clickhouse.command({ query: `OPTIMIZE TABLE ${table} FINAL` })
  }
}

/**
 * The analyzer upserts the analysis row before its taxonomy observations, so
 * `waitForTerminalAnalyses` can return while observation inserts are still in
 * flight. Wait until the observation count holds steady across consecutive
 * polls before rebasing, or the rebase silently misses the tail.
 */
async function waitForObservationStability(project: ProjectRow) {
  const clickhouse = getClickhouseClient()
  const startedAt = Date.now()
  let previous = -1
  while (Date.now() - startedAt < 10 * 60_000) {
    const rows = await clickhouse.query({
      query: `SELECT count() AS total
              FROM taxonomy_observations FINAL
              WHERE organization_id = {organizationId:String}
                AND project_id = {projectId:String}`,
      query_params: { organizationId: project.organization_id, projectId: project.project_id },
      format: "JSONEachRow",
    })
    const [row] = await rows.json<{ total: string | number }>()
    const total = Number(row?.total ?? 0)
    console.log(`Taxonomy observation rows for project ${project.project_id}: ${total}`)
    if (total === previous) return
    previous = total
    await new Promise((resolve) => setTimeout(resolve, 10_000))
  }
  throw new Error(`Timed out waiting for taxonomy observation writes to settle for project ${project.project_id}`)
}

async function rebaseObservationsToNow(project: ProjectRow) {
  const clickhouse = getClickhouseClient()
  // Server-side cutoff taken before inserting the rebased copies: every
  // pre-existing row has indexed_at below it, every copy at or above it.
  const cutoffRows = await clickhouse.query({ query: "SELECT toString(now64(3)) AS cutoff", format: "JSONEachRow" })
  const [cutoffRow] = await cutoffRows.json<{ cutoff: string }>()
  if (!cutoffRow) throw new Error("Failed to read ClickHouse server time for the observation rebase")
  await clickhouse.command({
    query: `INSERT INTO taxonomy_observations
            (
              organization_id,
              project_id,
              observation_id,
              session_id,
              analysis_hash,
              moment_id,
              projection_method,
              projection_hash,
              projection_metadata,
              embedding,
              assigned_cluster_id,
              assignment_confidence,
              assignment_method,
              reassignment_run_id,
              start_time,
              end_time,
              retention_days,
              indexed_at
            )
            SELECT
              organization_id,
              project_id,
              observation_id,
              session_id,
              analysis_hash,
              moment_id,
              projection_method,
              projection_hash,
              projection_metadata,
              embedding,
              assigned_cluster_id,
              assignment_confidence,
              assignment_method,
              reassignment_run_id,
              now64(9) - toIntervalSecond(rowNumberInAllBlocks()),
              now64(9) - toIntervalSecond(rowNumberInAllBlocks()) + toIntervalSecond(60),
              retention_days,
              now64(3)
            FROM taxonomy_observations FINAL
            WHERE organization_id = {organizationId:String}
              AND project_id = {projectId:String}`,
    query_params: { organizationId: project.organization_id, projectId: project.project_id },
  })
  // Drop the pre-rebase originals. The table partitions by month of
  // start_time and ReplacingMergeTree dedup never crosses partitions, so the
  // stale-dated originals would otherwise survive FINAL alongside the copies
  // and sit outside the gardening lookback window.
  await clickhouse.command({
    query: `ALTER TABLE taxonomy_observations DELETE
            WHERE organization_id = {organizationId:String}
              AND project_id = {projectId:String}
              AND indexed_at < {cutoff:DateTime64(3)}`,
    query_params: {
      organizationId: project.organization_id,
      projectId: project.project_id,
      cutoff: cutoffRow.cutoff,
    },
    clickhouse_settings: { mutations_sync: "2" },
  })
  await clickhouse.command({ query: "OPTIMIZE TABLE taxonomy_observations FINAL" })
}

async function waitForTerminalAnalyses(project: ProjectRow, expected: number) {
  const clickhouse = getClickhouseClient()
  const startedAt = Date.now()
  while (Date.now() - startedAt < 20 * 60_000) {
    const rows = await clickhouse.query({
      query: `SELECT count() AS total
              FROM session_analyses FINAL
              WHERE organization_id = {organizationId:String}
                AND project_id = {projectId:String}`,
      query_params: { organizationId: project.organization_id, projectId: project.project_id },
      format: "JSONEachRow",
    })
    const [row] = await rows.json<{ total: string | number }>()
    const total = Number(row?.total ?? 0)
    console.log(`Analysis rows for project ${project.project_id}: ${total}/${expected}`)
    if (total >= expected) return
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  throw new Error(`Timed out waiting for ${expected} conversation analysis rows for project ${project.project_id}`)
}

loadDevelopmentEnvironments(new URL("../server.ts", import.meta.url).href)

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "organization-id": { type: "string" },
    "project-id": { type: "string" },
    limit: { type: "string", default: String(DEFAULT_LIMIT_PER_PROJECT) },
    concurrency: { type: "string", default: "2" },
    reset: { type: "boolean", default: false },
    "reset-taxonomy": { type: "boolean", default: false },
    "garden-after": { type: "boolean", default: false },
    "rebase-observations-to-now": { type: "boolean", default: false },
    "manual-reprocess": { type: "boolean", default: false },
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

const concurrency = parsePositiveInteger(values.concurrency ?? "2", "--concurrency")
const limit = parsePositiveInteger(values.limit ?? String(DEFAULT_LIMIT_PER_PROJECT), "--limit")
const clickhouse = getClickhouseClient()
const redis = getRedisClient()

void Effect.runPromise(
  Effect.gen(function* () {
    const projects = yield* Effect.promise(() =>
      listProjects({
        ...(values["organization-id"] ? { organizationId: values["organization-id"] } : {}),
        ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
      }),
    )
    const workflowStarter = yield* Effect.promise(() => getWorkflowStarter())
    const reason = values["manual-reprocess"] ? "manual_reprocess" : "backfill"
    console.log(`Found ${projects.length.toString()} project(s) to backfill`)

    for (const project of projects) {
      if (values.reset) {
        console.log(`Resetting conversation intelligence for project ${project.project_id}`)
        yield* Effect.promise(() => resetProjectConversationIntelligence(project))
      }
      if (values["reset-taxonomy"]) {
        console.log(`Resetting taxonomy graph for project ${project.project_id}`)
        yield* Effect.promise(() => resetProjectTaxonomy(project))
      }

      const sessions = yield* Effect.gen(function* () {
        const repository = yield* SessionRepository
        const page = yield* repository.listByProjectId({
          organizationId: project.organization_id as OrganizationIdType,
          projectId: ProjectId(project.project_id),
          options: { limit, sortBy: "lastActivity", sortDirection: "asc" },
        })
        return page.items.filter((session) => session.traceIds.length > 0)
      }).pipe(withClickHouse(SessionRepositoryLive, clickhouse, project.organization_id as OrganizationIdType))

      console.log(
        `Starting AnalyzeSessionWorkflow for ${sessions.length.toString()} sessions in project ${project.project_id}`,
      )
      yield* Effect.forEach(
        sessions,
        (session, index) => {
          const workflowId = `org:${project.organization_id}:conversation-intelligence:analyzeSession:${project.project_id}:${session.sessionId}`
          return workflowStarter
            .start(
              "analyzeSessionWorkflow",
              {
                organizationId: project.organization_id,
                projectId: project.project_id,
                sessionId: session.sessionId,
                triggeringTraceId: session.traceIds[0] ?? session.sessionId,
                triggeringStartTime: session.startTime.toISOString(),
                reason,
              },
              { workflowId },
            )
            .pipe(
              Effect.tap(() =>
                Effect.sync(() => console.log(`Started ${index + 1}/${sessions.length}: ${workflowId}`)),
              ),
            )
        },
        { concurrency, discard: true },
      )

      if (values["garden-after"]) {
        yield* Effect.promise(() => waitForTerminalAnalyses(project, sessions.length))
        yield* Effect.promise(() => waitForObservationStability(project))
        if (values["rebase-observations-to-now"]) {
          console.log(`Rebasing taxonomy observations to now for project ${project.project_id}`)
          yield* Effect.promise(() => rebaseObservationsToNow(project))
        }
        console.log(`Gardening taxonomy for project ${project.project_id}`)
        yield* runGardenProjectJob(
          { organizationId: project.organization_id, projectId: project.project_id, reason: "manual" },
          { clickhouseClient: clickhouse, postgresClient: getPostgresClient(), redisClient: redis, workflowStarter },
        )
      }
    }
  }).pipe(
    Effect.ensuring(
      Effect.promise(async () => {
        const adminPostgres = getAdminPostgresClient()
        await Promise.allSettled([
          closeClickhouse(clickhouse),
          redis.quit(),
          adminPostgres.pool.end(),
          ...(values["garden-after"] ? [getPostgresClient().pool.end()] : []),
        ])
      }),
    ),
  ),
).catch((error: unknown) => {
  console.error("Conversation intelligence backfill failed")
  console.error(error)
  process.exitCode = 1
})
