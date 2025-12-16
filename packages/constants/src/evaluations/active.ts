// Adding a workflowUuid to have a cross-reference id to track all the evaluation generation/validation loop
export type ActiveEvaluation = {
  workflowUuid: string
  issueId: number | null
  queuedAt: Date
  evaluationUuid?: string // Can be null in the beginning of the workflow, when the first eval config hasnt been generated yet
  evaluationName?: string
  targetUuid?: string // Default target composite evaluation
  targetAction?: string
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
