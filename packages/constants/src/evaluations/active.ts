import { EvaluationV2 } from '..'

export type ActiveEvaluation = Pick<EvaluationV2, 'uuid' | 'issueId'> & {
  queuedAt: Date
  startedAt?: Date
  endedAt?: Date
  error?: Error
}

export const ACTIVE_EVALUATIONS_CACHE_KEY = (
  workspaceId: number,
  projectId: number,
) => `evaluations:active:${workspaceId}:${projectId}`
export const ACTIVE_EVALUATIONS_CACHE_TTL = 1 * 3 * 60 * 60 * 1000 // 3 hours
export const ACTIVE_EVALUATIONS_CACHE_TTL_SECONDS = Math.floor(
  ACTIVE_EVALUATIONS_CACHE_TTL / 1000,
)
