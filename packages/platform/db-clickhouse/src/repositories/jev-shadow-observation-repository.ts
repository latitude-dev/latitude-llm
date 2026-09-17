import type { ClickHouseClient } from "@clickhouse/client"
import { type JevShadowObservation, JevShadowObservationRepository } from "@domain/flaggers"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { formatCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"

const toInsertRow = (observation: JevShadowObservation) => ({
  observation_id: observation.observationId,
  organization_id: observation.organizationId as string,
  project_id: observation.projectId as string,
  session_id: observation.sessionId as string,
  flagger_slug: observation.flaggerSlug,
  screening_decision_id: observation.screeningDecisionId,
  analysis_hash: observation.analysisHash,
  scoring_artifact_version: observation.scoringArtifactVersion,
  screening_attempt: observation.screeningAttempt,
  screening_version: observation.screeningVersion,
  workflow_id: observation.workflowId,
  workflow_run_id: observation.workflowRunId,
  activity_id: observation.activityId,
  activity_attempt: observation.activityAttempt,
  state_hash: observation.stateHash,
  state_builder_version: observation.stateBuilderVersion,
  state_truncated: observation.stateTruncated,
  provider: observation.provider,
  requested_model: observation.requestedModel,
  resolved_model: observation.resolvedModel,
  question_version: observation.questionVersion,
  policy_version: observation.policyVersion,
  threshold: observation.threshold,
  probability: observation.probability,
  advisory_decision: observation.advisoryDecision,
  status: observation.status,
  error_category: observation.errorCategory,
  latency_ms: observation.latencyMs,
  input_tokens: observation.inputTokens,
  output_tokens: observation.outputTokens,
  selection_reason: observation.selectionReason,
  selection_probability: observation.selectionProbability,
  observed_at: formatCHDate(observation.observedAt),
  retention_days: observation.retentionDays,
})

export const JevShadowObservationRepositoryLive = Layer.effect(
  JevShadowObservationRepository,
  Effect.gen(function* () {
    return {
      save: (observation) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client, organizationId, signal) => {
              if (observation.organizationId !== organizationId) {
                throw new Error("Jev shadow observation organization does not match the ClickHouse scope")
              }
              await client.insert({
                table: "flagger_jev_shadow_observations",
                values: [toInsertRow(observation)],
                format: "JSONEachRow",
                abort_signal: signal,
              })
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "JevShadowObservationRepository.save")))
        }),
    }
  }),
)
