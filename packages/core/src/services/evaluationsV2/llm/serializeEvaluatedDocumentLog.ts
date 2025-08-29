import {
  ActualOutputConfiguration,
  DocumentLog,
  EvaluatedDocumentLog,
  ProviderLog,
  buildConversation,
  formatConversation,
} from '../../../browser'
import { serializeAggregatedProviderLog } from '../../documentLogs/serialize'
import serializeProviderLog from '../../providerLogs/serialize'
import { extractActualOutput } from '../outputs/extract'

export async function serializeEvaluatedDocumentLog({
  documentLog,
  providerLogs,
  configuration,
}: {
  documentLog: DocumentLog
  providerLogs: ProviderLog[]
  configuration?: ActualOutputConfiguration
}): Promise<EvaluatedDocumentLog> {
  const aggregatedProviderLog = await serializeAggregatedProviderLog({
    documentLog,
    providerLogs,
  }).then((r) => r.unwrap())
  const providerLog = serializeProviderLog(
    providerLogs[providerLogs.length - 1]!,
  )
  const conversation = formatConversation(buildConversation(providerLog))
  const actualOutput = await extractActualOutput({
    providerLog: providerLog,
    configuration: configuration,
  }).then((r) => r.unwrap())
  return {
    ...aggregatedProviderLog,
    uuid: documentLog.uuid,
    createdAt: documentLog.createdAt,
    actualOutput,
    conversation,
  }
}
