import type { Message as LegacyMessage, ToolCall } from '@latitude-data/constants/legacyCompiler'
import type { FinishReason, LanguageModelUsage } from 'ai'

import type { LogSources, ProviderLog, Providers, Workspace } from '../../browser'
import type { ChainStepResponse, StreamType } from '@latitude-data/constants/ai'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { providerLogs } from '../../schema'
import { estimateCost, type PartialConfig } from '../ai'
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
  output?: ChainStepResponse<StreamType>['output']
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
    output,
  }: CreateProviderLogProps,
  transaction = new Transaction(),
) {
  return await transaction.call<ProviderLog>(async (trx) => {
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
        output,
        toolCalls,
        tokens: usage
          ? Number.isNaN(usage.totalTokens)
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
  })
}
