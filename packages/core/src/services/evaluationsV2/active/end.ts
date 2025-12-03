import { publisher } from '../../../events/publisher'
import { Result } from '../../../lib/Result'
import { deleteActiveEvaluation } from './delete'

export async function endActiveEvaluation({
  workspaceId,
  projectId,
  workflowUuid,
}: {
  workspaceId: number
  projectId: number
  workflowUuid: string
}) {
  const deleteResult = await deleteActiveEvaluation({
    workspaceId,
    projectId,
    workflowUuid,
  })

  if (!Result.isOk(deleteResult)) return deleteResult
  const activeEvaluation = deleteResult.unwrap()

  await publisher.publishLater({
    type: 'evaluationEnded',
    data: { workspaceId, projectId, evaluation: activeEvaluation },
  })

  return Result.ok(true)
}
