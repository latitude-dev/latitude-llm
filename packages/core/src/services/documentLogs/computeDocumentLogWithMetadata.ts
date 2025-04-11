import { DocumentLog } from '../../browser'
import { database } from '../../client'
import { findWorkspaceFromDocumentLog } from '../../data-access'
import { DocumentLogWithMetadataAndError } from '../../repositories'
import { DocumentLogsWithMetadataAndErrorsRepository } from '../../repositories/documentLogsWithMetadataAndErrorsRepository'
import { NotFoundError } from './../../lib/errors'
import { Result } from './../../lib/Result'
import { TypedResult } from './../../lib/Result'

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
