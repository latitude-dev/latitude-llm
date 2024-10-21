import { and, eq } from 'drizzle-orm'

import { DocumentLog } from '../../browser'
import { database } from '../../client'
import { findWorkspaceFromDocumentLog } from '../../data-access'
import { NotFoundError, Result, TypedResult } from '../../lib'
import { DocumentLogWithMetadataAndError } from '../../repositories'
import { createDocumentLogQuery } from './_createDocumentLogQuery'

export async function computeDocumentLogWithMetadata(
  documentLog: DocumentLog,
  db = database,
): Promise<TypedResult<DocumentLogWithMetadataAndError, Error>> {
  const workspace = await findWorkspaceFromDocumentLog(documentLog, db)
  if (!workspace) return Result.error(new NotFoundError('Workspace not found'))

  const { scope, baseQuery } = createDocumentLogQuery(workspace.id, db)

  const result = await baseQuery
    .where(and(eq(scope.id, documentLog.id)))
    .limit(1)

  if (result.length === 0) {
    return Result.error(new NotFoundError('Document log not found'))
  }

  return Result.ok(result[0]!)
}
