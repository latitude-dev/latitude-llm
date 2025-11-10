import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import { RunsRepository } from '../../repositories'

export async function updateRun({
  workspaceId,
  projectId,
  runUuid,
  caption,
}: {
  workspaceId: number
  projectId: number
  runUuid: string
  caption: string
}) {
  const repository = new RunsRepository(workspaceId, projectId)
  const updating = await repository.update({ runUuid, caption })
  if (!Result.isOk(updating)) return updating

  await publisher.publishLater({
    type: 'runProgress',
    data: { runUuid, projectId, workspaceId },
  })

  return updating
}
