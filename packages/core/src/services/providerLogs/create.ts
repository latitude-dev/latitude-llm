import { Message, ToolCall } from '@latitude-data/compiler'
import { LanguageModelUsage } from 'ai'

import { LogSources, ProviderLog, Providers } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result, Transaction } from '../../lib'
import { providerLogs } from '../../schema'
import { estimateCost, PartialConfig } from '../ai'
import { touchApiKey } from '../apiKeys'
import { StreamConsumeReturn } from '../chains/ChainStreamConsumer/consumeStream'
import { touchProviderApiKey } from '../providerApiKeys/touch'

const TO_MILLICENTS_FACTOR = 100_000

export type CreateProviderLogProps = {
  uuid: string
  generatedAt: Date
  providerId: number
  providerType: Providers
  model: string
  config: PartialConfig
  messages: Message[]
  usage: LanguageModelUsage
  duration: number
  source: LogSources
  finishReason?: StreamConsumeReturn['finishReason']
  apiKeyId?: number
  responseText?: string
  responseObject?: unknown
  toolCalls?: ToolCall[]
  documentLogUuid?: string
  costInMillicents?: number
}

export async function createProviderLog(
  {
    uuid,
    providerId,
    providerType,
    model,
    config,
    messages,
    responseText,
    responseObject,
    toolCalls,
    usage,
    duration,
    source,
    apiKeyId,
    documentLogUuid,
    generatedAt,
    costInMillicents,
    finishReason = 'stop',
  }: CreateProviderLogProps,
  db = database,
) {
  return await Transaction.call<ProviderLog>(async (trx) => {
    const cost =
      costInMillicents ??
      Math.floor(
        estimateCost({ provider: providerType, model, usage }) *
          TO_MILLICENTS_FACTOR,
      )
    const inserts = await trx
      .insert(providerLogs)
      .values({
        generatedAt: generatedAt,
        uuid,
        documentLogUuid,
        providerId,
        model,
        config,
        messages,
        responseText,
        responseObject,
        toolCalls,
        tokens: isNaN(usage.totalTokens) ? 0 : (usage.totalTokens ?? 0),
        costInMillicents: cost,
        duration,
        source,
        apiKeyId,
        finishReason,
      })
      .returning()

    const log = inserts[0]! as ProviderLog
    await touchProviderApiKey(providerId, trx)

    if (apiKeyId) await touchApiKey(apiKeyId, trx)

    publisher.publishLater({
      type: 'providerLogCreated',
      data: log,
    })

    return Result.ok(log)
  }, db)
}
