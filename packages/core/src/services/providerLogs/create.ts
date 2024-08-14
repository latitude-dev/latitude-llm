import { Message, ToolCall } from '@latitude-data/compiler'
import {
  database,
  providerLogs,
  Result,
  touchApiKey,
  Transaction,
} from '@latitude-data/core'
import { LogSources, ProviderLog, Providers } from '$core/browser'
import { CompletionTokenUsage } from 'ai'

import { touchProviderApiKey } from '../providerApiKeys/touch'

export type CreateProviderLogProps = {
  uuid: string
  providerId: number
  providerType: Providers
  model: string
  config: Record<string, unknown>
  messages: Message[]
  responseText: string
  toolCalls?: ToolCall[]
  usage: CompletionTokenUsage
  duration: number
  source: LogSources
  apiKeyId?: number
}

export async function createProviderLog(
  {
    uuid,
    providerId,
    providerType: _,
    model,
    config,
    messages,
    responseText,
    toolCalls,
    usage,
    duration,
    source,
    apiKeyId,
  }: CreateProviderLogProps,
  db = database,
) {
  return Transaction.call<ProviderLog>(async (trx) => {
    // TODO: Calculate cost based on usage, provider type, and model
    const tokens = usage.totalTokens ?? 0
    const cost = 0

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
        cost,
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
