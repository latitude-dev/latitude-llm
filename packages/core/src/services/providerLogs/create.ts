import type { Message, ToolCall } from '@latitude-data/constants/messages'
import { FinishReason } from 'ai'

import { LogSources, Providers } from '@latitude-data/constants'
import { type ProviderLog } from '../../schema/models/types/ProviderLog'
import { ProviderLogFileData } from '../../schema/models/types/ProviderLog'
import { type Workspace } from '../../schema/models/types/Workspace'
import {
  ChainStepResponse,
  LegacyVercelSDKVersion4Usage as LanguageModelUsage,
  StreamType,
} from '@latitude-data/constants/ai'
import { publisher } from '../../events/publisher'
import { diskFactory } from '../../lib/disk'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { providerLogs } from '../../schema/models/providerLogs'
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

async function deleteProviderLogFile(fileKey: string) {
  try {
    const disk = diskFactory('private')
    await disk.delete(fileKey)
  } catch (error) {
    console.warn('Failed to delete provider log file:', error)
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
  messages: Message[]
  usage?: LanguageModelUsage
  duration?: number
  source: LogSources
  finishReason?: FinishReason
  apiKeyId?: number
  responseText?: string
  responseReasoning?: string
  responseObject?: unknown
  toolCalls?: ToolCall[] | null
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
  const fileKey = generateProviderLogFileKey(uuid)
  const fileData: ProviderLogFileData = {
    config: config ?? null,
    messages,
    output: output ?? null,
    responseObject: responseObject ?? null,
    responseText: responseText ?? null,
    responseReasoning: responseReasoning ?? null,
    toolCalls: toolCalls ?? [],
  }

  const fileStorageResult = await storeProviderLogFile(fileKey, fileData)
  if (fileStorageResult.error) return fileStorageResult

  try {
    const log = await transaction
      .call<ProviderLog>(
        async (trx) => {
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
              fileKey,
              // The actual data is stored in file storage
              messages: [],
              toolCalls: [],
              tokens: usage
                ? usage.totalTokens === undefined || isNaN(usage.totalTokens)
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

          return Result.ok(log)
        },
        (log) => {
          publisher.publishLater({
            type: 'providerLogCreated',
            data: {
              id: log.id,
              workspaceId: workspace.id,
            },
          })
        },
      )
      .then((r) => r.unwrap())

    return Result.ok({
      ...log,
      ...fileData,
    })
  } catch (error) {
    await deleteProviderLogFile(fileKey)

    return Result.error(error as Error)
  }
}
