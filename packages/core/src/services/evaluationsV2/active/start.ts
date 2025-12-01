import { publisher } from '../../../events/publisher'
import { Result } from '../../../lib/Result'
import { updateActiveEvaluation } from './update'

export async function startActiveEvaluation({
  workspaceId,
  projectId,
  workflowUuid,
}: {
  workspaceId: number
  projectId: number
  workflowUuid: string
}) {
  const updateResult = await updateActiveEvaluation({
    workspaceId,
    projectId,
    workflowUuid,
    startedAt: new Date(),
  })
  if (!Result.isOk(updateResult)) return updateResult
  const activeEvaluation = updateResult.unwrap()

  await publisher.publishLater({
    type: 'evaluationStarted',
    data: { workspaceId, projectId, evaluation: activeEvaluation },
  })

  return updateResult
}
