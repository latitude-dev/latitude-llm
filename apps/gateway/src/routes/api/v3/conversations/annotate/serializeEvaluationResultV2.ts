import type { EvaluationResultV2, PublicManualEvaluationResultV2 } from '@latitude-data/constants'
import type { Commit } from '@latitude-data/core/browser'

export function serializeEvaluationResultV2(
  evaluationResult: EvaluationResultV2,
  { commit }: { commit: Commit },
): PublicManualEvaluationResultV2 {
  return {
    uuid: evaluationResult.uuid,
    versionUuid: commit.uuid,
    score: evaluationResult.score,
    normalizedScore: evaluationResult.normalizedScore,
    metadata: evaluationResult.metadata,
    hasPassed: evaluationResult.hasPassed,
    error: evaluationResult.error?.message ?? null,
    createdAt: evaluationResult.createdAt,
    updatedAt: evaluationResult.updatedAt,
  }
}
