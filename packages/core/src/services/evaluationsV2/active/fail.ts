import { publisher } from '../../../events/publisher'
import { Result } from '../../../lib/Result'
import { updateActiveEvaluation } from './update'

export async function failActiveEvaluation({
  workspaceId,
  projectId,
  workflowUuid,
  error,
}: {
  workspaceId: number
  projectId: number
  workflowUuid: string
  error: Error
}) {
  const deleteResult = await updateActiveEvaluation({
    workspaceId,
    projectId,
    workflowUuid,
    error,
  })
  if (!Result.isOk(deleteResult)) return deleteResult
  const activeEvaluation = deleteResult.unwrap()
  await publisher.publishLater({
    type: 'evaluationFailed',
    data: { workspaceId, projectId, evaluation: activeEvaluation, error },
  })
  return deleteResult
}
