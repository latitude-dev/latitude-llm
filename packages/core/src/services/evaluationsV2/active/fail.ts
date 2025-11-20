import { publisher } from '../../../events/publisher'
import { Result } from '../../../lib/Result'
import { updateActiveEvaluation } from './update'

export async function failActiveEvaluation({
  workspaceId,
  projectId,
  evaluationUuid,
  error,
}: {
  workspaceId: number
  projectId: number
  evaluationUuid: string
  error?: Error
}) {
  const deleteResult = await updateActiveEvaluation({
    workspaceId,
    projectId,
    evaluationUuid,
    error,
  })
  if (!Result.isOk(deleteResult)) return deleteResult
  const evaluation = deleteResult.unwrap()
  await publisher.publishLater({
    type: 'evaluationFailed',
    data: { workspaceId, projectId, evaluation },
  })
  return deleteResult
}
