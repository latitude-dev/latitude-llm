import { database } from '../../client'
import { DocumentLogWithMetadataAndError } from '../../constants'
import { NotFoundError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { computeDocumentLogWithMetadata } from './computeDocumentLogWithMetadata'
import { findDocumentLog } from './data-access/findDocumentLog'

export async function fetchDocumentLogWithMetadata(
  {
    workspaceId,
    documentLogUuid,
    documentLogId,
  }: {
    workspaceId: number
    documentLogUuid?: string
    documentLogId?: number
  },
  db = database,
): Promise<TypedResult<DocumentLogWithMetadataAndError, Error>> {
  const documentLog = await findDocumentLog({
    workspaceId,
    documentLogUuid,
    documentLogId,
  })
  if (!documentLog) {
    return Result.error(new NotFoundError(`Document Log not found`))
  }

  // TODO: change this
  const documentLogWithMetadata = await computeDocumentLogWithMetadata(
    documentLog,
    db,
  ).then((r) => r.unwrap())

  return Result.ok(documentLogWithMetadata)
}
