import { OrganizationId, ProjectId } from "@domain/shared"
import { SessionRepository } from "@domain/spans"
import { SessionRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { Effect } from "effect"
import { getAdminPostgresClient, getClickhouseClient } from "../clients.ts"

const OBSERVATION_STABILITY_TIMEOUT_MS = 10 * 60_000
const OBSERVATION_STABILITY_POLL_MS = 10_000

export interface SessionIntelligenceBackfillActivityInput {
  readonly organizationId: string
  readonly projectId: string
}

export interface ListBackfillSessionsActivityInput extends SessionIntelligenceBackfillActivityInput {
  readonly sessionLimit: number
}

export interface BackfillSessionDescriptor {
  readonly sessionId: string
  readonly triggeringTraceId: string
  readonly triggeringStartTime: string
}

export async function resetSessionIntelligenceForProjectActivity(
  input: SessionIntelligenceBackfillActivityInput,
): Promise<void> {
  const clickhouse = getClickhouseClient()
  const queryParams = { organizationId: input.organizationId, projectId: input.projectId }

  for (const table of [
    "session_moment_labels",
    "session_semantic_moments",
    "taxonomy_observations",
    "session_analyses",
  ] as const) {
    await clickhouse.command({
      query: `ALTER TABLE ${table} DELETE WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}`,
      query_params: queryParams,
      clickhouse_settings: { mutations_sync: "2" },
    })
    await clickhouse.command({ query: `OPTIMIZE TABLE ${table} FINAL` })
  }
}

export async function resetTaxonomyForProjectActivity(input: SessionIntelligenceBackfillActivityInput): Promise<void> {
  const adminPostgres = getAdminPostgresClient()
  const params = [input.organizationId, input.projectId]

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

export async function listBackfillSessionsActivity(
  input: ListBackfillSessionsActivityInput,
): Promise<readonly BackfillSessionDescriptor[]> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const repository = yield* SessionRepository
      const page = yield* repository.listByProjectId({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        options: { limit: input.sessionLimit, sortBy: "lastActivity", sortDirection: "desc" },
      })
      return page.items
        .filter((session) => session.traceIds.length > 0)
        .map((session) => ({
          sessionId: session.sessionId,
          triggeringTraceId: session.traceIds[0] ?? session.sessionId,
          triggeringStartTime: session.startTime.toISOString(),
        }))
    }).pipe(withClickHouse(SessionRepositoryLive, getClickhouseClient(), OrganizationId(input.organizationId))),
  )
}

async function readClickHouseCount(query: string, input: SessionIntelligenceBackfillActivityInput): Promise<number> {
  const rows = await getClickhouseClient().query({
    query,
    query_params: { organizationId: input.organizationId, projectId: input.projectId },
    format: "JSONEachRow",
  })
  const [row] = await rows.json<{ total: string | number }>()
  return Number(row?.total ?? 0)
}

export async function waitForTaxonomyObservationStabilityActivity(
  input: SessionIntelligenceBackfillActivityInput,
): Promise<void> {
  const startedAt = Date.now()
  let previous = -1

  while (Date.now() - startedAt < OBSERVATION_STABILITY_TIMEOUT_MS) {
    const total = await readClickHouseCount(
      `SELECT count() AS total
       FROM taxonomy_observations FINAL
       WHERE organization_id = {organizationId:String}
         AND project_id = {projectId:String}`,
      input,
    )
    if (total === previous) return
    previous = total
    await new Promise((resolve) => setTimeout(resolve, OBSERVATION_STABILITY_POLL_MS))
  }

  throw new Error(`Timed out waiting for taxonomy observations to settle for project ${input.projectId}`)
}
