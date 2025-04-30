import {
  buildConversation,
  DocumentLog,
  ProviderLog,
  formatMessage,
  EvaluatedDocumentLog,
} from '@latitude-data/core/browser'
import { serializeAggregatedProviderLog } from '../../documentLogs/serialize'

export function serializeEvaluatedDocumentLog({
  documentLog,
  providerLogs,
}: {
  documentLog: DocumentLog
  providerLogs: ProviderLog[]
}): EvaluatedDocumentLog {
  const aggregatedProviderLog = serializeAggregatedProviderLog({
    documentLog,
    providerLogs,
  }).unwrap()
  const providerLog = providerLogs[providerLogs.length - 1]!
  const conversation = buildConversation(providerLog)
  const actualOutput = formatMessage(conversation.at(-1)!)
  return {
    ...aggregatedProviderLog,
    uuid: documentLog.uuid,
    createdAt: documentLog.createdAt,
    actualOutput,
    conversation,
  }
}
