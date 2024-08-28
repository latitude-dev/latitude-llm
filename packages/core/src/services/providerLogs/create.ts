import { Message, ToolCall } from '@latitude-data/compiler'
import { CompletionTokenUsage } from 'ai'

import { LogSources, ProviderLog, Providers } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { providerLogs } from '../../schema'
import { estimateCost } from '../ai'
import { touchApiKey } from '../apiKeys'
import { touchProviderApiKey } from '../providerApiKeys/touch'

export type CreateProviderLogProps = {
  uuid: string
  generatedAt: Date
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
  documentLogUuid?: string
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
    toolCalls,
    usage,
    duration,
    source,
    apiKeyId,
    documentLogUuid,
    generatedAt,
  }: CreateProviderLogProps,
  db = database,
) {
  return await Transaction.call<ProviderLog>(async (trx) => {
    const cost = estimateCost({ provider: providerType, model, usage })

    const inserts = await trx
      .insert(providerLogs)
      .values({
        // TODO: Review if wrapping with a `new Date` is necessary.
        // `generatedAt` is already a `Date` object, so this should work but it doesn't.
        // I saw this workouround here:
        // https://github.com/drizzle-team/drizzle-orm/issues/1113#issuecomment-2220076371
        //
        // Docs for timestamp with `{ mode: 'date' }`
        // https://orm.drizzle.team/docs/column-types/pg#timestamp
        generatedAt: new Date(generatedAt),
        uuid,
        documentLogUuid,
        providerId,
        model,
        config,
        messages,
        responseText,
        toolCalls,
        tokens: usage.totalTokens ?? 0,
        cost_in_millicents: Math.floor(cost * 100_000),
        duration,
        source,
        apiKeyId,
      })
      .returning()

    const log = inserts[0]! as ProviderLog
    await touchProviderApiKey(providerId, trx)
    if (apiKeyId) await touchApiKey(apiKeyId, trx)

    return Result.ok(log)
  }, db)
}
