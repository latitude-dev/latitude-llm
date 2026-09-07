import type { ClickHouseClient } from "@clickhouse/client"
import { type FlaggerScreeningDecision, FlaggerScreeningDecisionRepository } from "@domain/flaggers"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { formatCHDate } from "@repo/utils"
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
    }
  }),
)
