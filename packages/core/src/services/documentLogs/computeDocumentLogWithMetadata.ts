import { DocumentLog, DocumentLogWithMetadataAndError } from '../../browser'
import { database } from '../../client'
import { findWorkspaceFromDocumentLog } from '../../data-access'
import { NotFoundError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { DocumentLogsWithMetadataAndErrorsRepository } from '../../repositories/documentLogsWithMetadataAndErrorsRepository'

export async function computeDocumentLogWithMetadata(
  documentLog: DocumentLog,
  db = database,
): Promise<TypedResult<DocumentLogWithMetadataAndError, Error>> {
  const workspace = await findWorkspaceFromDocumentLog(documentLog, db)
  if (!workspace) return Result.error(new NotFoundError('Workspace not found'))

  // TODO: remove
  const repo = new DocumentLogsWithMetadataAndErrorsRepository(workspace.id, db)

  const result = await repo.find(documentLog.id)
  if (!Result.isOk(result)) return result

  return result
}
