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
  const deleteResult = await deleteActiveRun({
    workspaceId,
    projectId,
    runUuid,
  })
  if (!Result.isOk(deleteResult)) return deleteResult
  const run = deleteResult.unwrap()

  await publisher.publishLater({
    type: 'runEnded',
    data: { projectId, workspaceId, run },
  })

  return deleteResult
}
