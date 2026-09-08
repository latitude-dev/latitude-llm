import type { ClickHouseClient } from "@clickhouse/client"
import { FlaggerCoverageRepository, type FlaggerCoverageRow, flaggerCoverageRowSchema } from "@domain/flaggers"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { formatCHDate, normalizeCHString } from "@repo/utils"
import { Effect, Layer } from "effect"

const SESSION_END_DEBOUNCE_SECONDS = 5 * 60

const eligibleSessionsQuery = `
  SELECT count() AS eligible_sessions
  FROM (
    SELECT
      session_id,
      sum(tokens_total) AS tokens_total,
      groupUniqArrayIfMerge(models) AS models,
      argMaxIfMerge(simulation_id) AS simulation_id,
      if(
        max(max_start_time) >= min(min_start_time),
        max(max_start_time),
        max(max_end_time)
      ) AS last_activity_time
    FROM sessions
    WHERE organization_id = {organizationId:String}
      AND project_id = {projectId:String}
    GROUP BY session_id
    HAVING last_activity_time >= {from:DateTime64(9, 'UTC')}
      AND last_activity_time <= subtractSeconds({to:DateTime64(9, 'UTC')}, {debounceSeconds:UInt32})
      AND (tokens_total > 0 OR length(models) > 0)
      AND simulation_id = ''
  )
`

const coverageRowsQuery = `
  WITH eligible_sessions AS (
    SELECT session_id
    FROM (
      SELECT
        session_id,
        sum(tokens_total) AS tokens_total,
        groupUniqArrayIfMerge(models) AS models,
        argMaxIfMerge(simulation_id) AS simulation_id,
        if(
          max(max_start_time) >= min(min_start_time),
          max(max_start_time),
          max(max_end_time)
        ) AS last_activity_time
      FROM sessions
      WHERE organization_id = {organizationId:String}
        AND project_id = {projectId:String}
      GROUP BY session_id
      HAVING last_activity_time >= {from:DateTime64(9, 'UTC')}
        AND last_activity_time <= subtractSeconds({to:DateTime64(9, 'UTC')}, {debounceSeconds:UInt32})
        AND (tokens_total > 0 OR length(models) > 0)
        AND simulation_id = ''
    )
  ),
  newest_decisions AS (
    SELECT * EXCEPT generation_created_at
    FROM (
      SELECT
        decision_id,
        session_id,
        flagger_slug,
        analysis_hash,
        latest.1 AS selected,
        latest.2 AS reason,
        latest.3 AS inclusion_probability,
        latest.4 AS outcome,
        generation_created_at
      FROM (
        SELECT
          decision_id,
          session_id,
          flagger_slug,
          analysis_hash,
          min(created_at) AS generation_created_at,
          argMax(
            tuple(selected, reason, inclusion_probability, outcome),
            tuple(version, attempt, created_at)
          ) AS latest
        FROM flagger_screening_decisions
        WHERE organization_id = {organizationId:String}
          AND project_id = {projectId:String}
          AND created_at <= {to:DateTime64(9, 'UTC')}
          AND session_id IN (SELECT session_id FROM eligible_sessions)
        GROUP BY decision_id, session_id, flagger_slug, analysis_hash
      )
      ORDER BY session_id, flagger_slug, generation_created_at DESC, analysis_hash DESC
      LIMIT 1 BY session_id, flagger_slug
    )
  )
  SELECT
    flagger_slug,
    count() AS decided_sessions,
    countIf(selected AND outcome IS NOT NULL AND outcome != 'error') AS examined_sessions,
    countIf(
      selected
      AND outcome IS NOT NULL
      AND outcome != 'error'
      AND reason NOT IN ('skipped', 'rate-limited')
      AND inclusion_probability IS NOT NULL
      AND inclusion_probability > 0
    ) AS readable_sessions,
    countIf(reason = 'deterministic') AS deterministic,
    countIf(reason = 'hinted') AS hinted,
    countIf(reason = 'uniform-sample') AS uniform_sample,
    countIf(reason = 'ordinary-sample') AS ordinary_sample,
    countIf(reason = 'skipped') AS skipped,
    countIf(reason = 'rate-limited') AS rate_limited,
    countIf(selected AND outcome IN ('matched', 'failure')) AS positive_findings,
    countIf(
      selected
      AND outcome IN ('matched', 'failure')
      AND reason NOT IN ('skipped', 'rate-limited')
      AND inclusion_probability IS NOT NULL
      AND inclusion_probability > 0
    ) AS calibration_ready_findings,
    countIf(
      selected
      AND outcome IS NOT NULL
      AND outcome != 'error'
      AND (inclusion_probability IS NULL OR inclusion_probability <= 0)
    ) AS unknown_selection_probability
  FROM newest_decisions
  GROUP BY flagger_slug
  ORDER BY flagger_slug
`

interface EligibleSessionsRow {
  readonly eligible_sessions: string
}

interface CoverageRow {
  readonly flagger_slug: string
  readonly decided_sessions: string
  readonly examined_sessions: string
  readonly readable_sessions: string
  readonly deterministic: string
  readonly hinted: string
  readonly uniform_sample: string
  readonly ordinary_sample: string
  readonly skipped: string
  readonly rate_limited: string
  readonly positive_findings: string
  readonly calibration_ready_findings: string
  readonly unknown_selection_probability: string
}

const toCount = (value: string): number => Number(value)

const toCoverageRow = (row: CoverageRow, eligibleSessions: number): FlaggerCoverageRow => {
  const decidedSessions = toCount(row.decided_sessions)
  const readableSessions = toCount(row.readable_sessions)
  return flaggerCoverageRowSchema.parse({
    flaggerSlug: normalizeCHString(row.flagger_slug),
    eligibleSessions,
    decidedSessions,
    examinedSessions: toCount(row.examined_sessions),
    readableSessions,
    readableShare: eligibleSessions > 0 ? readableSessions / eligibleSessions : 0,
    selectionPaths: {
      deterministic: toCount(row.deterministic),
      hinted: toCount(row.hinted),
      uniformSample: toCount(row.uniform_sample),
      ordinarySample: toCount(row.ordinary_sample),
      skipped: toCount(row.skipped),
      rateLimited: toCount(row.rate_limited),
    },
    positiveFindings: toCount(row.positive_findings),
    calibrationReadyFindings: toCount(row.calibration_ready_findings),
    unknownSelectionProbability: toCount(row.unknown_selection_probability),
    missingTelemetry: Math.max(0, eligibleSessions - decidedSessions),
  })
}

export const FlaggerCoverageRepositoryLive = Layer.effect(
  FlaggerCoverageRepository,
  Effect.gen(function* () {
    return {
      getProjectCoverage: ({ organizationId, projectId, from, to }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const queryParams = {
                organizationId: organizationId as string,
                projectId: projectId as string,
                from: formatCHDate(from),
                to: formatCHDate(to),
                debounceSeconds: SESSION_END_DEBOUNCE_SECONDS,
              }
              const [eligibleResult, coverageResult] = await Promise.all([
                client.query({ query: eligibleSessionsQuery, query_params: queryParams, format: "JSONEachRow" }),
                client.query({ query: coverageRowsQuery, query_params: queryParams, format: "JSONEachRow" }),
              ])
              const eligibleRows = await eligibleResult.json<EligibleSessionsRow>()
              const eligibleSessions = toCount(eligibleRows[0]?.eligible_sessions ?? "0")
              const rows = (await coverageResult.json<CoverageRow>()).map((row) => toCoverageRow(row, eligibleSessions))
              return { organizationId, projectId, from, to, eligibleSessions, rows }
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "FlaggerCoverageRepository.getProjectCoverage")))
        }),
    }
  }),
)
