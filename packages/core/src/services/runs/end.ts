import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import { RunsRepository } from '../../repositories'

export async function endRun({
  workspaceId,
  projectId,
  runUuid,
}: {
  workspaceId: number
  projectId: number
  runUuid: string
}) {
  const repository = new RunsRepository(workspaceId, projectId)

  const done = await repository.delete({ runUuid })
  if (!Result.isOk(done)) return done

  await publisher.publishLater({
    type: 'runEnded',
    data: { runUuid, projectId, workspaceId },
  })

  return done
}
