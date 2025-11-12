import { DocumentLog } from '@latitude-data/constants'
import { DocumentLogsRepository } from '../../../repositories'

export async function findDocumentLog({
  workspaceId,
  documentLogUuid,
  documentLogId,
}: {
  workspaceId: number
  documentLogUuid?: string
  documentLogId?: number
}) {
  const identifier = documentLogUuid || documentLogId
  if (identifier === undefined) return

  const repo = new DocumentLogsRepository(workspaceId)
  let documentLog: DocumentLog | undefined = undefined
  if (documentLogUuid) {
    documentLog = await repo.findByUuid(documentLogUuid).then((r) => r.unwrap())
  } else if (documentLogId) {
    documentLog = await repo.find(documentLogId).then((r) => r.unwrap())
  }

  return documentLog
}
