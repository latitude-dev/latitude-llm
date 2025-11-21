import { publisher } from '../../../events/publisher'
import { Result } from '../../../lib/Result'
import { updateActiveEvaluation } from './update'

export async function startActiveEvaluation({
  workspaceId,
  projectId,
  evaluationUuid,
}: {
  workspaceId: number
  projectId: number
  evaluationUuid: string
}) {
  const updateResult = await updateActiveEvaluation({
    workspaceId,
    projectId,
    evaluationUuid,
    startedAt: new Date(),
  })
  if (!Result.isOk(updateResult)) return updateResult
  const evaluation = updateResult.unwrap()

  await publisher.publishLater({
    type: 'evaluationStarted',
    data: { workspaceId, projectId, evaluation },
  })

  return updateResult
}
