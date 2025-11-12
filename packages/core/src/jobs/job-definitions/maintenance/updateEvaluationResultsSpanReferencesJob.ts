import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { Result } from '../../../lib/Result'
import { updateEvaluationResultsSpanReferences } from '../../../services/evaluationsV2/updateSpanReferences'

export type UpdateEvaluationResultsSpanReferencesJobData = {
  workspaceId: number
}

/**
 * Job that updates evaluation results with span references for a specific workspace.
 *
 * This job:
 * 1. Finds evaluation results with evaluatedLogId but missing span references
 * 2. Links them to prompt spans through provider logs and document logs
 * 3. Updates the evaluation result with the span ID and trace ID
 */
export const updateEvaluationResultsSpanReferencesJob = async (
  job: Job<UpdateEvaluationResultsSpanReferencesJobData>,
) => {
  const { workspaceId } = job.data
  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) {
    return Result.error(new Error(`Workspace ${workspaceId} not found`))
  }

  const result = await updateEvaluationResultsSpanReferences(workspaceId)

  if (result.error) {
    throw new Error(result.error.message)
  }

  return result.unwrap()
}
