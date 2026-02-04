import { faker } from '@faker-js/faker'
import { v4 as uuid } from 'uuid'

import { LogSources, Providers } from '@latitude-data/constants'
import { type ProviderLog } from '../../schema/models/types/ProviderLog'
import { type Workspace } from '../../schema/models/types/Workspace'
import { createProviderLog as createProviderLogService } from '../../services/providerLogs/create'
import type { ToolCall, Message } from '@latitude-data/constants/messages'

export type IProviderLogData = {
  documentLogUuid: string
  providerId: number
  providerType: Providers
  model?: string
  tokens?: number
  duration?: number
  source?: LogSources
  costInMillicents?: number
  generatedAt?: Date
  workspace: Workspace
  responseObject?: unknown
  responseText?: string
  messages?: Message[]
  toolCalls?: ToolCall[]
  apiKeyId?: number
}

export async function createProviderLog(
  data: IProviderLogData,
): Promise<ProviderLog> {
  const providerLog = await createProviderLogService({
    uuid: uuid(),
    workspace: data.workspace,
    generatedAt: data.generatedAt ?? new Date(),
    documentLogUuid: data.documentLogUuid,
    providerId: data.providerId,
    providerType: data.providerType,
    model: data.model ?? faker.lorem.word(),
    config: { model: 'gpt-4o' },
    messages: data.messages ?? [],
    responseText: data.responseText ?? faker.lorem.sentence(),
    responseObject: data.responseObject,
    toolCalls: [],
    usage: {
      inputTokens: data.tokens ?? faker.number.int({ min: 10, max: 100 }),
      outputTokens: data.tokens ?? faker.number.int({ min: 10, max: 100 }),
      promptTokens: data.tokens ?? faker.number.int({ min: 10, max: 100 }),
      completionTokens: data.tokens ?? faker.number.int({ min: 10, max: 100 }),
      totalTokens: data.tokens ?? faker.number.int({ min: 20, max: 200 }),
      reasoningTokens: 0,
      cachedInputTokens: 0,
    },
    duration: data.duration ?? faker.number.int({ min: 100, max: 5000 }),
    source: data.source ?? LogSources.Playground,
    costInMillicents:
      data.costInMillicents ?? faker.number.int({ min: 100, max: 5000 }),
    apiKeyId: data.apiKeyId,
  }).then((r) => r.unwrap())

  return providerLog
}
