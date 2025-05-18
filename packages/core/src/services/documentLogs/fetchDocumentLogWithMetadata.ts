import { database } from '../../client'
import {
  DocumentLogsRepository,
  DocumentLogWithMetadataAndError,
} from '../../repositories'
import { NotFoundError } from './../../lib/errors'
import { Result } from './../../lib/Result'
import { TypedResult } from './../../lib/Result'
import { computeDocumentLogWithMetadata } from './computeDocumentLogWithMetadata'
import { DocumentLog } from '@latitude-data/constants'

function throwNotFound({
  identifier,
  type,
}: {
  identifier: string | number | undefined
  type: 'id' | 'uuid'
}) {
  return Result.error(
    new NotFoundError(`Document Log not found with ${type}: ${identifier}`),
  )
}

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
  const identifier = documentLogUuid || documentLogId
  const type = documentLogUuid ? 'uuid' : 'id'
  if (identifier === undefined) return throwNotFound({ identifier, type })

  const repo = new DocumentLogsRepository(workspaceId, db)
  let documentLog: DocumentLog | undefined = undefined
  if (documentLogUuid) {
    documentLog = await repo.findByUuid(documentLogUuid).then((r) => r.unwrap())
  } else if (documentLogId) {
    documentLog = await repo.find(documentLogId).then((r) => r.unwrap())
  }
  if (!documentLog) return throwNotFound({ identifier, type })

  // TODO: change this
  const documentLogWithMetadata = await computeDocumentLogWithMetadata(
    documentLog,
    db,
  ).then((r) => r.unwrap())

  return Result.ok(documentLogWithMetadata)
}
