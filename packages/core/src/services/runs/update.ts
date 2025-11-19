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
  const updateResult = await updateActiveRun({
    workspaceId,
    projectId,
    runUuid,
    caption,
  })
  if (!Result.isOk(updateResult)) return updateResult
  const run = updateResult.unwrap()

  await publisher.publishLater({
    type: 'runProgress',
    data: { projectId, workspaceId, run },
  })

  return updateResult
}
