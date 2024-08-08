import { Message, ToolCall } from '@latitude-data/compiler'
import {
  database,
  providerLogs,
  Result,
  touchApiKey,
  Transaction,
} from '@latitude-data/core'
import { LogSources, ProviderLog } from '$core/browser'

import { touchProviderApiKey } from '../providerApiKeys/touch'

export type CreateProviderLogProps = {
  uuid: string
  providerId: number
  model: string
  config: Record<string, unknown>
  messages: Message[]
  responseText: string
  toolCalls?: ToolCall[]
  tokens: number
  duration: number
  source: LogSources
  apiKeyId?: number
}

export async function createProviderLog(
  {
    uuid,
    providerId,
    model,
    config,
    messages,
    responseText,
    toolCalls,
    tokens,
    duration,
    source,
    apiKeyId,
  }: CreateProviderLogProps,
  db = database,
) {
  return Transaction.call<ProviderLog>(async (trx) => {
    const inserts = await trx
      .insert(providerLogs)
      .values({
        uuid,
        providerId,
        model,
        config,
        messages,
        responseText,
        toolCalls,
        tokens,
        duration,
        source,
        apiKeyId,
      })
      .returning()

    const log = inserts[0]!
    await touchProviderApiKey(providerId, trx)
    if (apiKeyId) await touchApiKey(apiKeyId, trx)

    return Result.ok(log)
  }, db)
}
