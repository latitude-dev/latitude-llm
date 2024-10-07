import { DocumentLog, SerializedDocumentLog } from '../../browser'
import { database } from '../../client'
import { findWorkspaceFromDocumentLog } from '../../data-access'
import { NotFoundError, PromisedResult, Result } from '../../lib'
import { ProviderLogsRepository } from '../../repositories'
import { serialize as serializeProviderLog } from '../providerLogs'

export async function serialize(
  documentLog: DocumentLog,
  db = database,
): PromisedResult<SerializedDocumentLog> {
  const workspace = await findWorkspaceFromDocumentLog(documentLog, db)
  if (!workspace) return Result.error(new NotFoundError('Workspace not found'))

  const providerLogsScope = new ProviderLogsRepository(workspace.id, db)
  const providerLogsResult = await providerLogsScope.findByDocumentLogUuid(
    documentLog.uuid,
  )
  if (providerLogsResult.error) return Result.error(providerLogsResult.error)
  if (!providerLogsResult.value.length) {
    return Result.error(
      new NotFoundError('ProviderLogs not found for DocumentLog'),
    )
  }
  const totalCostInMillicents = providerLogsResult.value.reduce(
    (acc, providerLog) => acc + providerLog.costInMillicents,
    0,
  )
  const lastProviderLog = providerLogsResult.value.pop()!

  return Result.ok({
    ...serializeProviderLog(lastProviderLog),
    parameters: documentLog.parameters,
    prompt: documentLog.resolvedContent,
    duration: documentLog.duration,
    cost: totalCostInMillicents / 1000,
  })
}
