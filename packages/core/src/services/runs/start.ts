import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import { updateActiveRun } from './active/update'

export async function startRun({
  workspaceId,
  projectId,
  runUuid,
}: {
  workspaceId: number
  projectId: number
  runUuid: string
}) {
  const updateResult = await updateActiveRun({
    workspaceId,
    projectId,
    runUuid,
    startedAt: new Date(),
  })
  if (!Result.isOk(updateResult)) return updateResult
  const run = updateResult.unwrap()

  await publisher.publishLater({
    type: 'runStarted',
    data: { projectId, workspaceId, run },
  })

  return updateResult
}
