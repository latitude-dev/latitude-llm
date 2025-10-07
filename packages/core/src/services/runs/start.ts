import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import { RunsRepository } from '../../repositories'

export async function startRun({
  workspaceId,
  projectId,
  runUuid,
}: {
  workspaceId: number
  projectId: number
  runUuid: string
}) {
  const repository = new RunsRepository(workspaceId, projectId)

  const updating = await repository.update({ runUuid, startedAt: new Date() })
  if (!Result.isOk(updating)) return updating

  await publisher.publishLater({
    type: 'runStarted',
    data: { runUuid, projectId, workspaceId },
  })

  return updating
}
