import { publisher } from '../../../events/publisher'
import { Result } from '../../../lib/Result'
import { deleteActiveEvaluation } from './delete'

export async function endActiveEvaluation({
  workspaceId,
  projectId,
  evaluationUuid,
}: {
  workspaceId: number
  projectId: number
  evaluationUuid: string
}) {
  const deleteResult = await deleteActiveEvaluation({
    workspaceId,
    projectId,
    evaluationUuid,
  })

  if (!Result.isOk(deleteResult)) return deleteResult
  const evaluation = deleteResult.unwrap()

  await publisher.publishLater({
    type: 'evaluationEnded',
    data: { workspaceId, projectId, evaluation },
  })

  return Result.ok(true)
}
