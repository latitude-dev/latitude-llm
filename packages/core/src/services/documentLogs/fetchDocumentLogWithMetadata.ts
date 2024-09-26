import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { NotFoundError, Result, TypedResult } from '../../lib'
import { DocumentLogWithMetadata } from '../../repositories/documentLogsRepository'
import { createDocumentLogQuery } from './_createDocumentLogQuery'

export async function fetchDocumentLogWithMetadata(
  {
    workspaceId,
    documentLogId,
  }: {
    workspaceId: number
    documentLogId: number
  },
  db = database,
): Promise<TypedResult<DocumentLogWithMetadata, Error>> {
  const { scope, baseQuery } = createDocumentLogQuery(workspaceId, db)
  const logs = await baseQuery.where(eq(scope.id, documentLogId)).limit(1)
  const documentLog = logs[0]

  if (!documentLog) {
    return Result.error(
      new NotFoundError(`Document Log not found with ID: ${documentLogId}`),
    )
  }

  return Result.ok(documentLog)
}
