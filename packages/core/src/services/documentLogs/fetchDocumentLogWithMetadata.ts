import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { NotFoundError, Result, TypedResult } from '../../lib'
import { DocumentLogWithMetadataAndError } from '../../repositories'
import { createDocumentLogQuery } from './_createDocumentLogQuery'

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

  const { scope, baseQuery } = createDocumentLogQuery(workspaceId, db)
  let logs: DocumentLogWithMetadataAndError[] = []

  if (documentLogUuid) {
    logs = await baseQuery.where(eq(scope.uuid, documentLogUuid)).limit(1)
  } else if (documentLogId) {
    logs = await baseQuery.where(eq(scope.id, documentLogId)).limit(1)
  }

  const documentLog = logs[0]

  if (!documentLog) {
    return throwNotFound({ identifier, type })
  }

  return Result.ok(documentLog)
}
