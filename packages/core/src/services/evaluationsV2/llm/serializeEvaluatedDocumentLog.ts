import {
  DocumentLog,
  ProviderLog,
  formatConversation,
  formatMessage,
  EvaluatedDocumentLog,
  buildConversation,
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
  const conversationList = buildConversation(providerLog)
  const conversation = formatConversation(conversationList)
  const actualOutput = formatMessage(conversationList.at(-1)!)
  return {
    ...aggregatedProviderLog,
    uuid: documentLog.uuid,
    createdAt: documentLog.createdAt,
    actualOutput,
    conversation,
  }
}
