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
  const updating = await updateActiveRun({
    workspaceId,
    projectId,
    runUuid,
    startedAt: new Date(),
  })
  if (!Result.isOk(updating)) return updating

  await publisher.publishLater({
    type: 'runStarted',
    data: { runUuid, projectId, workspaceId },
  })

  return updating
}
