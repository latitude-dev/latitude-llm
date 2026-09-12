import type { ClickHouseClient } from "@clickhouse/client"
import { type SafetyWindowDecision, SafetyWindowDecisionSource } from "@domain/agent-score"
import {
  FLAGGER_NO_REFLAG_TAG,
  type FlaggerScreeningOutcome,
  type FlaggerScreeningSelectionReason,
} from "@domain/flaggers"
import { ChSqlClient, type ChSqlClientShape, SessionId, toRepositoryError } from "@domain/shared"
import { formatCHDate, normalizeCHString } from "@repo/utils"
import { Effect, Layer } from "effect"
import {
  ELIGIBLE_SESSION_COUNT_QUERY,
  ELIGIBLE_SESSION_IDS_QUERY,
  SESSION_END_DEBOUNCE_SECONDS,
} from "./eligible-sessions.ts"

/**
 * The newest screening generation per session and suite member, revisions collapsed.
 *
 * `LIMIT 1 BY session_id, flagger_slug` keeps each member's own newest
 * generation rather than forcing one across the suite, so a session whose
 * members answered in different generations is visible as such to the estimator.
 */
const decisionsQuery = `
  WITH eligible_sessions AS (${ELIGIBLE_SESSION_IDS_QUERY})
  SELECT
    session_id,
    flagger_slug,
    analysis_hash,
    latest.1 AS selected,
    latest.2 AS reason,
    latest.3 AS inclusion_probability,
    latest.4 AS outcome,
    latest.5 AS hint_kinds
  FROM (
    SELECT
      decision_id,
      session_id,
      flagger_slug,
      analysis_hash,
      min(created_at) AS generation_created_at,
      argMax(
        tuple(selected, reason, inclusion_probability, outcome, hint_kinds),
        tuple(version, attempt, created_at)
      ) AS latest
    FROM flagger_screening_decisions
    WHERE organization_id = {organizationId:String}
      AND project_id = {projectId:String}
      AND flagger_slug IN {suiteSlugs:Array(String)}
      AND created_at <= {to:DateTime64(9, 'UTC')}
      AND session_id IN (SELECT session_id FROM eligible_sessions)
    GROUP BY decision_id, session_id, flagger_slug, analysis_hash
  )
  ORDER BY session_id, flagger_slug, generation_created_at DESC, analysis_hash DESC
  LIMIT 1 BY session_id, flagger_slug
`

interface EligibleSessionsRow {
  readonly eligible_sessions: string
}

interface DecisionRow {
  readonly session_id: string
  readonly flagger_slug: string
  readonly analysis_hash: string
  readonly selected: boolean | number
  readonly reason: string
  readonly inclusion_probability: number | null
  readonly outcome: string | null
  readonly hint_kinds: readonly string[] | null
}

const toDecision = (row: DecisionRow): SafetyWindowDecision => ({
  sessionId: SessionId(normalizeCHString(row.session_id)),
  flaggerSlug: normalizeCHString(row.flagger_slug),
  analysisHash: normalizeCHString(row.analysis_hash),
  selected: Boolean(row.selected),
  reason: normalizeCHString(row.reason) as FlaggerScreeningSelectionReason,
  hintKinds: (row.hint_kinds ?? []).map(normalizeCHString),
  ...(row.inclusion_probability === null ? {} : { inclusionProbability: row.inclusion_probability }),
  ...(row.outcome === null || row.outcome === ""
    ? {}
    : { outcome: normalizeCHString(row.outcome) as FlaggerScreeningOutcome }),
})

export const SafetyWindowDecisionSourceLive = Layer.succeed(SafetyWindowDecisionSource, {
  read: ({ organizationId, projectId, from, to, suiteSlugs }) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      return yield* chSqlClient
        .query(async (client) => {
          const queryParams = {
            organizationId: organizationId as string,
            projectId: projectId as string,
            suiteSlugs: [...suiteSlugs],
            from: formatCHDate(from),
            to: formatCHDate(to),
            debounceSeconds: SESSION_END_DEBOUNCE_SECONDS,
            noReflagTag: FLAGGER_NO_REFLAG_TAG,
          }
          const [eligibleResult, decisionResult] = await Promise.all([
            client.query({ query: ELIGIBLE_SESSION_COUNT_QUERY, query_params: queryParams, format: "JSONEachRow" }),
            client.query({ query: decisionsQuery, query_params: queryParams, format: "JSONEachRow" }),
          ])
          const eligibleRows = await eligibleResult.json<EligibleSessionsRow>()
          const decisionRows = await decisionResult.json<DecisionRow>()

          return {
            eligibleSessionCount: Number(eligibleRows[0]?.eligible_sessions ?? "0"),
            decisions: decisionRows.map(toDecision),
          }
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "SafetyWindowDecisionSource.read")))
    }),
})
