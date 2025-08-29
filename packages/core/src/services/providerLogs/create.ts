import type {
  Message as LegacyMessage,
  ToolCall,
} from '@latitude-data/constants/legacyCompiler'
import { FinishReason, LanguageModelUsage } from 'ai'

import {
  LogSources,
  ProviderLog,
  ProviderLogFileData,
  Providers,
  Workspace,
} from '../../browser'
import { ChainStepResponse, StreamType } from '@latitude-data/constants/ai'
import { publisher } from '../../events/publisher'
import { diskFactory } from '../../lib/disk'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { providerLogs } from '../../schema'
import { estimateCost, PartialConfig } from '../ai'
const TO_MILLICENTS_FACTOR = 100_000

function generateProviderLogFileKey(uuid: string): string {
  return `provider-logs/${uuid}.json`
}

async function storeProviderLogFile(
  fileKey: string,
  data: ProviderLogFileData,
) {
  try {
    const disk = diskFactory('private')
    const content = JSON.stringify(data)
    const result = await disk.put(fileKey, content)
    return result
  } catch (error) {
    return Result.error(error as Error)
  }
}

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

    // Store JSON data in file storage
    const fileKey = generateProviderLogFileKey(uuid)
    const fileData: ProviderLogFileData = {
      config,
      messages,
      output,
      responseObject,
      responseText,
      responseReasoning,
      toolCalls: toolCalls ?? [],
    }

    const fileStorageResult = await storeProviderLogFile(fileKey, fileData)
    if (fileStorageResult.error) {
      // Log the error but continue with database storage for backwards compatibility
      console.warn(
        'Failed to store provider log file:',
        fileStorageResult.error,
      )
    }

    const inserts = await trx
      .insert(providerLogs)
      .values({
        workspaceId: workspace.id,
        generatedAt: generatedAt,
        uuid,
        documentLogUuid,
        providerId,
        model,
        fileKey: fileStorageResult.error ? null : fileKey,
        // Provide minimal required values (these columns will be deprecated)
        // The actual data is now stored in file storage
        messages: fileStorageResult.error ? messages : [], // Fallback to original data if file storage failed
        toolCalls: fileStorageResult.error ? (toolCalls ?? []) : [], // Fallback to original data if file storage failed
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
  })
}
