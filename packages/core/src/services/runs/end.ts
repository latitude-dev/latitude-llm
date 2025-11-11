import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import { deleteActiveRun } from './active/delete'

export async function endRun({
  workspaceId,
  projectId,
  runUuid,
}: {
  workspaceId: number
  projectId: number
  runUuid: string
}) {
  const done = await deleteActiveRun({ workspaceId, projectId, runUuid })
  if (!Result.isOk(done)) return done

  await publisher.publishLater({
    type: 'runEnded',
    data: { runUuid, projectId, workspaceId },
  })

  return done
}
