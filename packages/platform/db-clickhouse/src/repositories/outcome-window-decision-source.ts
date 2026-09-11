import type { ClickHouseClient } from "@clickhouse/client"
import { type OutcomeWindowDecision, OutcomeWindowDecisionSource } from "@domain/agent-score"
import type { FlaggerScreeningOutcome, FlaggerScreeningSelectionReason } from "@domain/flaggers"
import { ChSqlClient, type ChSqlClientShape, SessionId, toRepositoryError } from "@domain/shared"
import { formatCHDate, normalizeCHString } from "@repo/utils"
import { Effect, Layer } from "effect"

const SESSION_END_DEBOUNCE_SECONDS = 5 * 60
const TASK_OUTCOME_FLAGGER_SLUG = "task-failure"

/**
 * Production sessions whose last activity has settled.
 *
 * Same population the flagger coverage panel counts, because Outcome's coverage
 * share is only meaningful against the base the judge could have sampled from.
 */
const ELIGIBLE_SESSIONS = `
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
`

const eligibleSessionsQuery = `SELECT count() AS eligible_sessions FROM (${ELIGIBLE_SESSIONS})`

/**
 * The newest screening generation per session, with its revisions collapsed.
 *
 * Two passes, in order: `argMax` over (version, attempt, created_at) folds a
 * decision's terminal row onto its initial one, then `LIMIT 1 BY` keeps only the
 * newest generation. A session whose newest generation is pending or failed
 * therefore arrives with no outcome rather than falling back to an older
 * generation that did produce one.
 */
const decisionsQuery = `
  WITH eligible_sessions AS (${ELIGIBLE_SESSIONS})
  SELECT
    session_id,
    analysis_hash,
    latest.1 AS selected,
    latest.2 AS reason,
    latest.3 AS inclusion_probability,
    latest.4 AS outcome
  FROM (
    SELECT
      decision_id,
      session_id,
      analysis_hash,
      min(created_at) AS generation_created_at,
      argMax(
        tuple(selected, reason, inclusion_probability, outcome),
        tuple(version, attempt, created_at)
      ) AS latest
    FROM flagger_screening_decisions
    WHERE organization_id = {organizationId:String}
      AND project_id = {projectId:String}
      AND flagger_slug = {flaggerSlug:String}
      AND created_at <= {to:DateTime64(9, 'UTC')}
      AND session_id IN (SELECT session_id FROM eligible_sessions)
    GROUP BY decision_id, session_id, analysis_hash
  )
  ORDER BY session_id, generation_created_at DESC, analysis_hash DESC
  LIMIT 1 BY session_id
`

interface EligibleSessionsRow {
  readonly eligible_sessions: string
}

interface DecisionRow {
  readonly session_id: string
  readonly analysis_hash: string
  readonly selected: boolean | number
  readonly reason: string
  readonly inclusion_probability: number | null
  readonly outcome: string | null
}

const toDecision = (row: DecisionRow): OutcomeWindowDecision => ({
  sessionId: SessionId(normalizeCHString(row.session_id)),
  analysisHash: normalizeCHString(row.analysis_hash),
  selected: Boolean(row.selected),
  reason: normalizeCHString(row.reason) as FlaggerScreeningSelectionReason,
  ...(row.inclusion_probability === null ? {} : { inclusionProbability: row.inclusion_probability }),
  ...(row.outcome === null || row.outcome === ""
    ? {}
    : { outcome: normalizeCHString(row.outcome) as FlaggerScreeningOutcome }),
})

export const OutcomeWindowDecisionSourceLive = Layer.succeed(OutcomeWindowDecisionSource, {
  read: ({ organizationId, projectId, from, to }) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      return yield* chSqlClient
        .query(async (client) => {
          const queryParams = {
            organizationId: organizationId as string,
            projectId: projectId as string,
            flaggerSlug: TASK_OUTCOME_FLAGGER_SLUG,
            from: formatCHDate(from),
            to: formatCHDate(to),
            debounceSeconds: SESSION_END_DEBOUNCE_SECONDS,
          }
          const [eligibleResult, decisionResult] = await Promise.all([
            client.query({ query: eligibleSessionsQuery, query_params: queryParams, format: "JSONEachRow" }),
            client.query({ query: decisionsQuery, query_params: queryParams, format: "JSONEachRow" }),
          ])
          const eligibleRows = await eligibleResult.json<EligibleSessionsRow>()
          const decisionRows = await decisionResult.json<DecisionRow>()

          return {
            eligibleSessionCount: Number(eligibleRows[0]?.eligible_sessions ?? "0"),
            decisions: decisionRows.map(toDecision),
          }
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "OutcomeWindowDecisionSource.read")))
    }),
})
