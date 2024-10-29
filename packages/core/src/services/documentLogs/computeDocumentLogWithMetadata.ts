import { DocumentLog } from '../../browser'
import { database } from '../../client'
import { findWorkspaceFromDocumentLog } from '../../data-access'
import { NotFoundError, Result, TypedResult } from '../../lib'
import { DocumentLogWithMetadataAndError } from '../../repositories'
import { DocumentLogsWithMetadataAndErrorsRepository } from '../../repositories/documentLogsWithMetadataAndErrorsRepository'

export async function computeDocumentLogWithMetadata(
  documentLog: DocumentLog,
  db = database,
): Promise<TypedResult<DocumentLogWithMetadataAndError, Error>> {
  const workspace = await findWorkspaceFromDocumentLog(documentLog, db)
  if (!workspace) return Result.error(new NotFoundError('Workspace not found'))

  const repo = new DocumentLogsWithMetadataAndErrorsRepository(workspace.id, db)

  const result = await repo.find(documentLog.id)
  if (result.error) return result

  return result
}
