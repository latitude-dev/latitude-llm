import { ActiveRun } from '@latitude-data/constants'
import { Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import { publisher } from '../../events/publisher'
import { updateActiveRunByDocument } from './active/byDocument/update'

export async function updateRun({
  workspaceId,
  projectId,
  documentUuid,
  commitUuid,
  runUuid,
  caption,
}: {
  workspaceId: number
  projectId: number
  documentUuid: string
  commitUuid: string
  runUuid: string
  caption: string
}): PromisedResult<ActiveRun, Error> {
  const updateResult = await updateActiveRunByDocument({
    workspaceId,
    projectId,
    documentUuid,
    runUuid,
    updates: { caption },
  })
  if (!Result.isOk(updateResult)) return updateResult

  const run = updateResult.unwrap()

  await publisher.publishLater({
    type: 'documentRunProgress',
    data: { projectId, workspaceId, documentUuid, commitUuid, run },
  })

  return updateResult
}
