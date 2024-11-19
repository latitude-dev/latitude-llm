import { DocumentLog, SerializedDocumentLog, Workspace } from '../../browser'
import { database } from '../../client'
import { NotFoundError, PromisedResult, Result } from '../../lib'
import { ProviderLogsRepository } from '../../repositories'
import { serializeForEvaluation as serializeProviderLog } from '../providerLogs'

export async function serialize(
  {
    workspace,
    documentLog,
  }: {
    workspace: Workspace
    documentLog: DocumentLog
  },
  db = database,
): PromisedResult<SerializedDocumentLog> {
  const providerLogsScope = new ProviderLogsRepository(workspace.id, db)
  const providerLogs = await providerLogsScope
    .findByDocumentLogUuid(documentLog.uuid)
    .then((r) => r.unwrap())

  if (!providerLogs.length) {
    return Result.error(
      new NotFoundError('ProviderLogs not found for DocumentLog'),
    )
  }

  const totalCostInMillicents = providerLogs.reduce(
    (acc, providerLog) => acc + providerLog.costInMillicents,
    0,
  )
  const lastProviderLog = providerLogs.pop()!

  return Result.ok({
    ...serializeProviderLog(lastProviderLog),
    parameters: documentLog.parameters,
    prompt: documentLog.resolvedContent,
    duration: documentLog.duration,
    cost: totalCostInMillicents / 1000,
  })
}
