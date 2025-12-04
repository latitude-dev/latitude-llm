import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import { deleteActiveRunByDocument } from './active/byDocument/delete'

export async function endRun({
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
  const deleteResult = await deleteActiveRunByDocument({
    workspaceId,
    projectId,
    documentUuid,
    runUuid,
  })
  if (!Result.isOk(deleteResult)) return deleteResult

  const run = deleteResult.unwrap()

  await publisher.publishLater({
    type: 'documentRunEnded',
    data: { projectId, workspaceId, documentUuid, commitUuid, run },
  })

  return deleteResult
}
