import { ActiveRun } from '@latitude-data/constants'
import { Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import { publisher } from '../../events/publisher'
import { updateActiveRun } from './active/update'

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
}): PromisedResult<ActiveRun, Error> {
  const updating = await updateActiveRun({
    workspaceId,
    projectId,
    runUuid,
    caption,
  })
  if (!Result.isOk(updating)) return updating

  await publisher.publishLater({
    type: 'runProgress',
    data: { runUuid, projectId, workspaceId },
  })

  return updating
}
