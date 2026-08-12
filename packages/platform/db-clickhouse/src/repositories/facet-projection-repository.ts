import type { ClickHouseClient } from "@clickhouse/client"
import {
  ChSqlClient,
  type ChSqlClientShape,
  FacetId,
  OrganizationId,
  ProjectId,
  SessionId,
  toRepositoryError,
} from "@domain/shared"
import {
  FacetProjectionRepository,
  type TaxonomyFacetProjection,
  taxonomyFacetProjectionSchema,
} from "@domain/taxonomy"
import { formatCHDate, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"
import { buildSessionFilterClauses, LIST_SELECT, resolvePercentileFilters } from "./session-repository.ts"

type TaxonomyFacetProjectionRow = {
  readonly organization_id: string
  readonly project_id: string
  readonly facet_id: string
  readonly session_observation_id: string
  readonly session_id: string
  readonly extracted_text: string
  readonly analysis_hash: string
  readonly embedding: readonly number[]
  readonly start_time: string
  readonly retention_days: number
  readonly indexed_at: string
}

const selectColumns = `
  organization_id,
  project_id,
  facet_id,
  session_observation_id,
  session_id,
  extracted_text,
  analysis_hash,
  embedding,
  start_time,
  retention_days,
  indexed_at
`

const toInsertRow = (projection: TaxonomyFacetProjection) => ({
  organization_id: projection.organizationId as string,
  project_id: projection.projectId as string,
  facet_id: projection.facetId as string,
  session_observation_id: projection.sessionObservationId,
  session_id: projection.sessionId as string,
  extracted_text: projection.extractedText,
  analysis_hash: projection.analysisHash,
  embedding: [...projection.embedding],
  start_time: formatCHDate(projection.startTime),
  retention_days: projection.retentionDays,
  indexed_at: formatCHDate(projection.indexedAt),
})

const toDomain = (row: TaxonomyFacetProjectionRow): TaxonomyFacetProjection =>
  taxonomyFacetProjectionSchema.parse({
    organizationId: OrganizationId(row.organization_id),
    projectId: ProjectId(row.project_id),
    facetId: FacetId(row.facet_id),
    sessionObservationId: row.session_observation_id,
    sessionId: SessionId(row.session_id),
    extractedText: row.extracted_text,
    analysisHash: row.analysis_hash,
    embedding: row.embedding,
    startTime: parseCHDate(row.start_time),
    retentionDays: row.retention_days,
    indexedAt: parseCHDate(row.indexed_at),
  })

export const FacetProjectionRepositoryLive = Layer.effect(
  FacetProjectionRepository,
  Effect.gen(function* () {
    return {
      upsertMany: (projections) =>
        Effect.gen(function* () {
          if (projections.length === 0) return
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client) => {
              await client.insert({
                table: "taxonomy_facet_projections",
                values: projections.map(toInsertRow),
                format: "JSONEachRow",
              })
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "FacetProjectionRepository.upsertMany")))
        }),

      listBySessionObservationIds: ({ organizationId, projectId, facetId, sessionObservationIds }) =>
        Effect.gen(function* () {
          if (sessionObservationIds.length === 0) return []
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${selectColumns}
                        FROM taxonomy_facet_projections FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND facet_id = {facetId:String}
                          AND session_observation_id IN {sessionObservationIds:Array(String)}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  facetId: facetId as string,
                  sessionObservationIds: sessionObservationIds as readonly string[],
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<TaxonomyFacetProjectionRow>()
              return rows.map(toDomain)
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "FacetProjectionRepository.listBySessionObservationIds"),
              ),
            )
        }),

      listWindowForReassignment: ({ organizationId, projectId, facetId, limit, filterSet }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          // A cohort×facet view routes only the cohort's sessions, compiled by the
          // same filter compiler the sample and the observation-space window use.
          const resolvedFilterSet = filterSet
            ? yield* resolvePercentileFilters(organizationId, projectId, filterSet)
            : undefined
          return yield* chSqlClient
            .query(async (client) => {
              let matchingSessionsClause = ""
              let filterParams: Record<string, unknown> = {}
              if (resolvedFilterSet) {
                const { havingClauses, whereClauses, params } = buildSessionFilterClauses(resolvedFilterSet)
                filterParams = params
                const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""
                const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
                matchingSessionsClause = `AND session_id IN (
                        SELECT session_id
                        FROM (
                          SELECT ${LIST_SELECT}
                          FROM sessions
                          WHERE organization_id = {organizationId:String}
                            AND project_id = {projectId:String}
                            ${extraWhere}
                          GROUP BY organization_id, project_id, session_id
                          ${havingClause}
                        )
                      )`
              }
              const result = await client.query({
                query: `SELECT
                          session_observation_id,
                          session_id,
                          embedding,
                          start_time
                        FROM taxonomy_facet_projections FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND facet_id = {facetId:String}
                          AND length(embedding) > 0
                          ${matchingSessionsClause}
                        ORDER BY start_time DESC, session_observation_id ASC
                        LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  facetId: facetId as string,
                  limit,
                  ...filterParams,
                },
                format: "JSONEachRow",
              })
              const rows =
                await result.json<
                  Pick<TaxonomyFacetProjectionRow, "session_observation_id" | "session_id" | "embedding" | "start_time">
                >()
              return rows.map((row) => ({
                observationId: row.session_observation_id,
                sessionId: SessionId(row.session_id),
                embedding: row.embedding,
                startTime: parseCHDate(row.start_time),
              }))
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "FacetProjectionRepository.listWindowForReassignment"),
              ),
            )
        }),

      healthByFacet: ({ organizationId, projectId, facetId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT count() AS analyzed,
                               countIf(extracted_text != '') AS clear,
                               uniqExactIf(extracted_text, extracted_text != '') AS distinctAnswers
                        FROM taxonomy_facet_projections FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND facet_id = {facetId:String}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  facetId: facetId as string,
                },
                format: "JSONEachRow",
              })
              const [row] = await result.json<{
                analyzed: string | number
                clear: string | number
                distinctAnswers: string | number
              }>()
              return {
                analyzed: Number(row?.analyzed ?? 0),
                clear: Number(row?.clear ?? 0),
                distinctAnswers: Number(row?.distinctAnswers ?? 0),
              }
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "FacetProjectionRepository.healthByFacet")))
        }),

      listRecentByFacet: ({ organizationId, projectId, facetId, limit, offset }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${selectColumns}
                        FROM taxonomy_facet_projections FINAL
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND facet_id = {facetId:String}
                          AND extracted_text != ''
                        ORDER BY indexed_at DESC, session_observation_id ASC
                        LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  facetId: facetId as string,
                  limit,
                  offset: offset ?? 0,
                },
                format: "JSONEachRow",
              })
              const rows = await result.json<TaxonomyFacetProjectionRow>()
              return rows.map(toDomain)
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "FacetProjectionRepository.listRecentByFacet")))
        }),

      deleteByFacet: ({ organizationId, projectId, facetId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client) => {
              await client.command({
                query: `DELETE FROM taxonomy_facet_projections
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND facet_id = {facetId:String}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  facetId: facetId as string,
                },
              })
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "FacetProjectionRepository.deleteByFacet")))
        }),
    }
  }),
)
