import type { ClickHouseClient } from "@clickhouse/client"
import {
  FLAGGER_NO_REFLAG_TAG,
  FlaggerCoverageRepository,
  type FlaggerCoverageRow,
  flaggerCoverageRowSchema,
} from "@domain/flaggers"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { formatCHDate, normalizeCHString } from "@repo/utils"
import { Effect, Layer } from "effect"

const SESSION_END_DEBOUNCE_SECONDS = 5 * 60

// `screenSessionFlaggersUseCase` exits on no-reflag sessions before writing any decision.
const eligibleSessionsSubquery = `
  SELECT
    session_id,
    sum(tokens_total) AS tokens_total,
    groupUniqArrayIfMerge(models) AS models,
    argMaxIfMerge(simulation_id) AS simulation_id,
    groupUniqArrayArray(tags) AS tags,
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
    AND NOT has(tags, {noReflagTag:String})
`

// Not `min(created_at)`: decisions are written after a session settles, past the sessions they cover.
const recordingSinceQuery = `
  SELECT
    count() AS decided_sessions,
    toUnixTimestamp64Milli(min(last_activity_time)) AS recording_since_ms
  FROM (${eligibleSessionsSubquery})
  WHERE session_id IN (
    SELECT session_id
    FROM flagger_screening_decisions
    WHERE organization_id = {organizationId:String}
      AND project_id = {projectId:String}
      AND created_at <= {to:DateTime64(9, 'UTC')}
  )
`

const coverageWindowQuery = `
  SELECT
    countIf(last_activity_time >= {windowStart:DateTime64(9, 'UTC')}) AS eligible_sessions,
    countIf(last_activity_time < {windowStart:DateTime64(9, 'UTC')}) AS sessions_before_recording
  FROM (${eligibleSessionsSubquery})
`

const coverageRowsQuery = `
  WITH eligible_sessions AS (
    SELECT session_id
    FROM (${eligibleSessionsSubquery})
    WHERE last_activity_time >= {windowStart:DateTime64(9, 'UTC')}
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

interface RecordingSinceRow {
  readonly decided_sessions: string
  readonly recording_since_ms: string
}

interface CoverageWindowRow {
  readonly eligible_sessions: string
  readonly sessions_before_recording: string
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
    unscreenedSessions: Math.max(0, eligibleSessions - decidedSessions),
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
              const scopeParams = {
                organizationId: organizationId as string,
                projectId: projectId as string,
                from: formatCHDate(from),
                to: formatCHDate(to),
                debounceSeconds: SESSION_END_DEBOUNCE_SECONDS,
                noReflagTag: FLAGGER_NO_REFLAG_TAG,
              }

              const recordingResult = await client.query({
                query: recordingSinceQuery,
                query_params: scopeParams,
                format: "JSONEachRow",
              })
              const recordingRow = (await recordingResult.json<RecordingSinceRow>())[0]
              const recordingSince =
                recordingRow && toCount(recordingRow.decided_sessions) > 0
                  ? new Date(Number(recordingRow.recording_since_ms))
                  : null

              const windowStart = recordingSince && recordingSince > from ? recordingSince : from
              const queryParams = { ...scopeParams, windowStart: formatCHDate(windowStart) }

              const [windowResult, coverageResult] = await Promise.all([
                client.query({ query: coverageWindowQuery, query_params: queryParams, format: "JSONEachRow" }),
                client.query({ query: coverageRowsQuery, query_params: queryParams, format: "JSONEachRow" }),
              ])
              const windowRow = (await windowResult.json<CoverageWindowRow>())[0]
              const eligibleSessions = toCount(windowRow?.eligible_sessions ?? "0")
              const sessionsBeforeRecording = toCount(windowRow?.sessions_before_recording ?? "0")
              const rows = (await coverageResult.json<CoverageRow>()).map((row) => toCoverageRow(row, eligibleSessions))

              return {
                organizationId,
                projectId,
                from: windowStart,
                to,
                recordingSince,
                eligibleSessions,
                sessionsBeforeRecording,
                rows,
              }
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "FlaggerCoverageRepository.getProjectCoverage")))
        }),
    }
  }),
)
