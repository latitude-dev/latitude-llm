import {
  buildConversation,
  DocumentLog,
  formatMessage,
  EvaluatedDocumentLog,
  Workspace,
} from '@latitude-data/core/browser'
import { serializeAggregatedProviderLog } from '../../documentLogs/serialize'
import { database } from '../../../client'
import { ProviderLogsRepository } from '../../../repositories'
import { Result, TypedResult } from '../../../lib/Result'

export async function serializeEvaluatedDocumentLog(
  {
    workspace,
    documentLog,
  }: {
    workspace: Workspace
    documentLog: DocumentLog
  },
  db = database,
): Promise<TypedResult<EvaluatedDocumentLog, Error>> {
  const providerLogsScope = new ProviderLogsRepository(workspace.id, db)
  const providerLogsResult = await providerLogsScope.findByDocumentLogUuid(
    documentLog.uuid,
  )

  if (providerLogsResult.error) return Result.error(providerLogsResult.error)

  const providerLogs = providerLogsResult.value
  const aggregatedProviderLog = serializeAggregatedProviderLog({
    documentLog,
    providerLogs,
  }).unwrap()

  const providerLog = providerLogs[providerLogs.length - 1]!
  const conversation = buildConversation(providerLog)
  const actualOutput = formatMessage(conversation.at(-1)!)

  return Result.ok({
    ...aggregatedProviderLog,
    uuid: documentLog.uuid,
    createdAt: documentLog.createdAt,
    actualOutput,
    conversation,
  })
}
