import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import { updateActiveRunByDocument } from './active/byDocument/update'

export async function startRun({
  workspaceId,
  projectId,
  documentUuid,
  commitUuid,
  runUuid,
}: {
  workspaceId: number
  projectId: number
  documentUuid: string
  commitUuid: string
  runUuid: string
}) {
  const startedAt = new Date()

  const updateResult = await updateActiveRunByDocument({
    workspaceId,
    projectId,
    documentUuid,
    runUuid,
    updates: { startedAt },
  })
  if (!Result.isOk(updateResult)) return updateResult

  const run = updateResult.unwrap()

  await publisher.publishLater({
    type: 'documentRunStarted',
    data: { projectId, workspaceId, documentUuid, commitUuid, run },
  })

  return updateResult
}
