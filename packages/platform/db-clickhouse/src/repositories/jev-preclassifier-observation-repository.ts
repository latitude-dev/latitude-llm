import type { ClickHouseClient } from "@clickhouse/client"
import { type JevPreclassifierObservation, JevPreclassifierObservationRepository } from "@domain/flaggers"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { formatCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"

const toInsertRow = (observation: JevPreclassifierObservation) => ({
  observation_id: observation.observationId,
  organization_id: observation.organizationId as string,
  project_id: observation.projectId as string,
  session_id: observation.sessionId as string,
  flagger_slug: observation.flaggerSlug,
  screening_decision_id: observation.screeningDecisionId,
  analysis_hash: observation.analysisHash,
  workflow_id: observation.workflowId,
  workflow_run_id: observation.workflowRunId,
  activity_id: observation.activityId,
  activity_attempt: observation.activityAttempt,
  state_hash: observation.stateHash,
  state_builder_version: observation.stateBuilderVersion,
  provider: observation.provider,
  requested_model: observation.requestedModel,
  resolved_model: observation.resolvedModel,
  question_version: observation.questionVersion,
  policy_version: observation.policyVersion,
  threshold: observation.threshold,
  probability: observation.probability,
  decision: observation.decision,
  error_category: observation.errorCategory,
  latency_ms: observation.latencyMs,
  input_tokens: observation.inputTokens,
  output_tokens: observation.outputTokens,
  classify_added: observation.classifyAdded,
  selection_reason: observation.selectionReason,
  observed_at: formatCHDate(observation.observedAt),
  retention_days: observation.retentionDays,
})

export const JevPreclassifierObservationRepositoryLive = Layer.effect(
  JevPreclassifierObservationRepository,
  Effect.gen(function* () {
    return {
      saveMany: (observations) =>
        Effect.gen(function* () {
          if (observations.length === 0) return
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          yield* chSqlClient
            .query(async (client, organizationId, signal) => {
              if (observations.some((observation) => observation.organizationId !== organizationId)) {
                throw new Error("Jev preclassifier observation organization does not match the ClickHouse scope")
              }
              await client.insert({
                table: "flagger_jev_preclassifier_observations",
                values: observations.map(toInsertRow),
                format: "JSONEachRow",
                abort_signal: signal,
              })
            })
            .pipe(
              Effect.mapError((error) => toRepositoryError(error, "JevPreclassifierObservationRepository.saveMany")),
            )
        }),
    }
  }),
)
