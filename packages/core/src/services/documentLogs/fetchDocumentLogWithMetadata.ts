import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { NotFoundError, Result, TypedResult } from '../../lib'
import { DocumentLogWithMetadataAndError } from '../../repositories'
import { documentLogs } from '../../schema'
import { computeDocumentLogsWithMetadataQuery } from './computeDocumentLogsWithMetadata'

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

  const scope = computeDocumentLogsWithMetadataQuery({ workspaceId }, db)
  let logs: DocumentLogWithMetadataAndError[] = []
  if (documentLogUuid) {
    logs = await scope.where(eq(documentLogs.uuid, documentLogUuid)).limit(1)
  } else if (documentLogId) {
    logs = await scope.where(eq(documentLogs.id, documentLogId)).limit(1)
  }

  const documentLog = logs[0]
  if (!documentLog) return throwNotFound({ identifier, type })

  return Result.ok(documentLog)
}
