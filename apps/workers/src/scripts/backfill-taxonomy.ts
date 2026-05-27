import { parseArgs } from "node:util"
import { type OrganizationId as OrganizationIdType, ProjectId } from "@domain/shared"
import { SessionRepository } from "@domain/spans"
import type { RedisClient } from "@platform/cache-redis"
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
import { runGardenProjectJob, runObserveSessionJob } from "../workers/taxonomy.ts"

const DEFAULT_LIMIT_PER_PROJECT = 250

type ProjectRow = {
  readonly organization_id: string
  readonly project_id: string
}

const USAGE = `
Usage: pnpm --filter @app/workers taxonomy:backfill [options]

Backfills behavior observations from materialized ClickHouse sessions and optionally gardens projects.

Options:
  --organization-id <id>   Restrict backfill to one organization
  --project-id <id>        Restrict backfill to one project
  --limit <n>              Process at most this many sessions per project (default: ${DEFAULT_LIMIT_PER_PROJECT})
  --concurrency <n>        Number of sessions to process in parallel (default: 4)
  --reset                  Clear existing taxonomy rows/observations for selected projects first
  --rebase-observations-to-now
                           Rewrite observation timestamps into the current gardening lookback window
  --skip-garden            Only record observations; do not run gardening after backfill
  --help                   Show this help
`.trim()

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive integer, received "${value}"`)
  }

  return parsed
}

async function closeRedisClient(redis: RedisClient): Promise<void> {
  await redis.quit().catch(() => undefined)
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

async function rebaseObservationsToNow(project: ProjectRow) {
  const clickhouse = getClickhouseClient()
  await clickhouse.command({
    query: `INSERT INTO behavior_observations
            SELECT
              organization_id,
              project_id,
              session_id,
              now64(9) - toIntervalSecond(rowNumberInAllBlocks()),
              now64(9) - toIntervalSecond(rowNumberInAllBlocks()) + toIntervalSecond(60),
              trace_ids,
              summary,
              summary_hash,
              embedding,
              embedding_model,
              assigned_cluster_id,
              assignment_confidence,
              assignment_method,
              reassignment_run_id,
              retention_days,
              now64(3)
            FROM behavior_observations FINAL
            WHERE organization_id = {organizationId:String}
              AND project_id = {projectId:String}`,
    query_params: { organizationId: project.organization_id, projectId: project.project_id },
  })
  await clickhouse.command({ query: "OPTIMIZE TABLE behavior_observations FINAL" })
}

async function resetProjectTaxonomy(project: ProjectRow) {
  const adminPostgres = getAdminPostgresClient()
  const clickhouse = getClickhouseClient()
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
    `DELETE FROM latitude.taxonomy_categories WHERE organization_id = $1 AND project_id = $2`,
    params,
  )
  await adminPostgres.pool.query(
    `DELETE FROM latitude.taxonomy_runs WHERE organization_id = $1 AND project_id = $2`,
    params,
  )
  await clickhouse.command({
    query:
      "ALTER TABLE behavior_observations DELETE WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}",
    query_params: { organizationId: project.organization_id, projectId: project.project_id },
    clickhouse_settings: { mutations_sync: "2" },
  })
  await clickhouse.command({ query: "OPTIMIZE TABLE behavior_observations FINAL" })
}

loadDevelopmentEnvironments(new URL("../server.ts", import.meta.url).href)

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "organization-id": { type: "string" },
    "project-id": { type: "string" },
    limit: { type: "string", default: String(DEFAULT_LIMIT_PER_PROJECT) },
    concurrency: { type: "string", default: "4" },
    reset: { type: "boolean", default: false },
    "rebase-observations-to-now": { type: "boolean", default: false },
    "skip-garden": { type: "boolean", default: false },
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
const limit = parsePositiveInteger(values.limit ?? String(DEFAULT_LIMIT_PER_PROJECT), "--limit")

const clickhouse = getClickhouseClient()
const postgres = getPostgresClient()
const redis = getRedisClient()

void Effect.runPromise(
  Effect.gen(function* () {
    const projects = yield* Effect.promise(() =>
      listProjects({
        ...(values["organization-id"] ? { organizationId: values["organization-id"] } : {}),
        ...(values["project-id"] ? { projectId: values["project-id"] } : {}),
      }),
    )

    console.log(`Found ${projects.length.toString()} project(s) to backfill`)

    for (const project of projects) {
      if (values.reset) {
        console.log(`Resetting taxonomy for project ${project.project_id}`)
        yield* Effect.promise(() => resetProjectTaxonomy(project))
      }

      const sessions = yield* Effect.gen(function* () {
        const repository = yield* SessionRepository
        const page = yield* repository.listByProjectId({
          organizationId: project.organization_id as OrganizationIdType,
          projectId: ProjectId(project.project_id),
          options: { limit, sortBy: "lastActivity", sortDirection: "asc" },
        })
        return page.items
      }).pipe(withClickHouse(SessionRepositoryLive, clickhouse, project.organization_id as OrganizationIdType))

      console.log(`Backfilling ${sessions.length.toString()} sessions for project ${project.project_id}`)

      yield* Effect.forEach(
        sessions,
        (session, index) =>
          runObserveSessionJob(
            {
              organizationId: project.organization_id,
              projectId: project.project_id,
              sessionId: session.sessionId,
              triggeringTraceId: session.traceIds[0] ?? session.sessionId,
              triggeringStartTime: session.startTime.toISOString(),
            },
            { clickhouseClient: clickhouse, postgresClient: postgres, redisClient: redis },
          ).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                console.log(`Observed ${index + 1}/${sessions.length}: ${session.sessionId}`)
              }),
            ),
          ),
        { concurrency, discard: true },
      )

      if (values["rebase-observations-to-now"]) {
        console.log(`Rebasing observations to now for project ${project.project_id}`)
        yield* Effect.promise(() => rebaseObservationsToNow(project))
      }

      if (!values["skip-garden"]) {
        console.log(`Gardening taxonomy for project ${project.project_id}`)
        const workflowStarter = yield* Effect.promise(() => getWorkflowStarter())
        yield* runGardenProjectJob(
          { organizationId: project.organization_id, projectId: project.project_id, reason: "manual" },
          { clickhouseClient: clickhouse, postgresClient: postgres, redisClient: redis, workflowStarter },
        )
        console.log(`Started Temporal naming workflows for pending taxonomy labels in project ${project.project_id}`)
      }
    }
  }).pipe(
    Effect.ensuring(
      Effect.promise(async () => {
        const adminPostgres = getAdminPostgresClient()
        await Promise.allSettled([
          closeClickhouse(clickhouse),
          closeRedisClient(redis),
          postgres.pool.end(),
          adminPostgres.pool.end(),
        ])
      }),
    ),
  ),
).catch((error: unknown) => {
  console.error("Taxonomy backfill failed")
  console.error(error)
  process.exitCode = 1
})
