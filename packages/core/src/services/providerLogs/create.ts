import type {
  Message as LegacyMessage,
  ToolCall,
} from '@latitude-data/constants/legacyCompiler'
import { FinishReason, LanguageModelUsage } from 'ai'

import { LogSources, ProviderLog, Providers, Workspace } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
import { providerLogs } from '../../schema'
import { estimateCost, PartialConfig } from '../ai'
const TO_MILLICENTS_FACTOR = 100_000

export type CreateProviderLogProps = {
  workspace: Workspace
  uuid: string
  generatedAt: Date
  providerId?: number
  providerType?: Providers
  model?: string
  config?: PartialConfig
  messages: LegacyMessage[]
  usage?: LanguageModelUsage
  duration?: number
  source: LogSources
  finishReason?: FinishReason
  apiKeyId?: number
  responseText?: string
  responseReasoning?: string
  responseObject?: unknown
  toolCalls?: ToolCall[]
  documentLogUuid?: string
  costInMillicents?: number
}

export async function createProviderLog(
  {
    workspace,
    uuid,
    providerId,
    providerType,
    model,
    config,
    messages,
    responseText,
    responseReasoning,
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
      (providerType && model && usage
        ? Math.floor(
            estimateCost({
              provider: providerType!,
              model: model!,
              usage: usage!,
            }) * TO_MILLICENTS_FACTOR,
          )
        : undefined)
    const inserts = await trx
      .insert(providerLogs)
      .values({
        workspaceId: workspace.id,
        generatedAt: generatedAt,
        uuid,
        documentLogUuid,
        providerId,
        model,
        config,
        messages,
        responseText,
        responseReasoning,
        responseObject,
        toolCalls,
        tokens: usage
          ? isNaN(usage.totalTokens)
            ? 0
            : (usage.totalTokens ?? 0)
          : undefined,
        costInMillicents: cost,
        duration,
        source,
        apiKeyId,
        finishReason,
      })
      .returning()

    const log = inserts[0]! as ProviderLog

    publisher.publishLater({
      type: 'providerLogCreated',
      data: {
        id: log.id,
        workspaceId: workspace.id,
      },
    })

    return Result.ok(log)
  }, db)
}
