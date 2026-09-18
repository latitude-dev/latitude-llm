import type { ClickHouseClient } from "@clickhouse/client"
import {
  type FlaggerScreeningDecision,
  FlaggerScreeningDecisionRepository,
  flaggerScreeningDecisionSchema,
} from "@domain/flaggers"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { formatCHDate, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"

const toInsertRow = (decision: FlaggerScreeningDecision) => ({
  decision_id: decision.decisionId,
  organization_id: decision.organizationId as string,
  project_id: decision.projectId as string,
  session_id: decision.sessionId as string,
  flagger_slug: decision.flaggerSlug,
  analysis_hash: decision.analysisHash,
  scoring_artifact_version: decision.scoringArtifactVersion,
  attempt: decision.attempt,
  version: decision.version,
  selected: decision.selected,
  reason: decision.reason,
  inclusion_probability: decision.inclusionProbability ?? null,
  hint_kinds: [...decision.hintKinds],
  outcome: decision.outcome ?? null,
  created_at: formatCHDate(decision.createdAt),
  retention_days: decision.retentionDays,
})

interface FlaggerScreeningDecisionRow {
  readonly decision_id: string
  readonly organization_id: string
  readonly project_id: string
  readonly session_id: string
  readonly flagger_slug: string
  readonly analysis_hash: string
  readonly scoring_artifact_version: string
  readonly attempt: number
  readonly version: number
  readonly selected: boolean
  readonly reason: string
  readonly inclusion_probability: number | null
  readonly hint_kinds: string[]
  readonly outcome: string | null
  readonly created_at: string
  readonly retention_days: number
}

const toDomain = (row: FlaggerScreeningDecisionRow): FlaggerScreeningDecision =>
  flaggerScreeningDecisionSchema.parse({
    decisionId: row.decision_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    sessionId: row.session_id,
    flaggerSlug: row.flagger_slug,
    analysisHash: row.analysis_hash,
    scoringArtifactVersion: row.scoring_artifact_version,
    attempt: Number(row.attempt),
    version: Number(row.version),
    selected: Boolean(row.selected),
    reason: row.reason,
    ...(row.inclusion_probability === null ? {} : { inclusionProbability: Number(row.inclusion_probability) }),
    hintKinds: row.hint_kinds,
    ...(row.outcome === null ? {} : { outcome: row.outcome }),
    createdAt: parseCHDate(row.created_at),
    retentionDays: Number(row.retention_days),
  })

const listLatestQuery = `
  SELECT * EXCEPT generation_created_at
  FROM (
    SELECT
      decision_id,
      organization_id,
      project_id,
      session_id,
      flagger_slug,
      analysis_hash,
      scoring_artifact_version,
      latest.1 AS attempt,
      latest.2 AS version,
      latest.3 AS selected,
      latest.4 AS reason,
      latest.5 AS inclusion_probability,
      latest.6 AS hint_kinds,
      latest.7 AS outcome,
      latest.8 AS created_at,
      latest.9 AS retention_days,
      generation_created_at
    FROM (
      SELECT
        decision_id,
        organization_id,
        project_id,
        session_id,
        flagger_slug,
        analysis_hash,
        any(scoring_artifact_version) AS scoring_artifact_version,
        min(created_at) AS generation_created_at,
        argMax(
          tuple(
            attempt,
            version,
            selected,
            reason,
            inclusion_probability,
            hint_kinds,
            outcome,
            created_at,
            retention_days
          ),
          tuple(version, attempt, created_at)
        ) AS latest
      FROM flagger_screening_decisions
      WHERE organization_id = {organizationId:String}
        AND project_id = {projectId:String}
        AND session_id IN {sessionIds:Array(String)}
        AND created_at <= {cutoff:DateTime64(3)}
      GROUP BY decision_id, organization_id, project_id, session_id, flagger_slug, analysis_hash
    )
    ORDER BY session_id, flagger_slug, generation_created_at DESC, analysis_hash DESC
    LIMIT 1 BY session_id, flagger_slug
  )
  ORDER BY session_id, flagger_slug
`

export const FlaggerScreeningDecisionRepositoryLive = Layer.effect(
  FlaggerScreeningDecisionRepository,
  Effect.gen(function* () {
    return {
      saveMany: (decisions) =>
        Effect.gen(function* () {
          if (decisions.length === 0) return
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client) => {
              await client.insert({
                table: "flagger_screening_decisions",
                values: decisions.map(toInsertRow),
                format: "JSONEachRow",
              })
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "FlaggerScreeningDecisionRepository.saveMany")))
        }),
      listLatestBySessions: ({ organizationId, projectId, sessionIds, cutoff }) =>
        Effect.gen(function* () {
          if (sessionIds.length === 0) return []
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: listLatestQuery,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  sessionIds: sessionIds.map(String),
                  cutoff: formatCHDate(cutoff),
                },
                format: "JSONEachRow",
              })
              return (await result.json<FlaggerScreeningDecisionRow>()).map(toDomain)
            })
            .pipe(
              Effect.mapError((error) =>
                toRepositoryError(error, "FlaggerScreeningDecisionRepository.listLatestBySessions"),
              ),
            )
        }),
    }
  }),
)
