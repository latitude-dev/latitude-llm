import { Message } from '@latitude-data/compiler'

import {
  ChainStepResponse,
  LogSources,
  ProviderApiKey,
  StreamType,
  Workspace,
} from '../../../browser'
import { StreamCommonData } from '../../../events/events'
import { generateUUIDIdentifier } from '../../../lib'
import { AIReturn, PartialConfig } from '../../ai'
import { processStreamObject } from './processStreamObject'
import { processStreamText } from './processStreamText'

async function buildCommonData({
  aiResult,
  startTime,
  workspace,
  source,
  apiProvider,
  config,
  messages,
  errorableUuid,
}: {
  aiResult: Awaited<AIReturn<StreamType>>
  startTime: number
  workspace: Workspace
  source: LogSources
  apiProvider: ProviderApiKey
  config: PartialConfig
  messages: Message[]
  errorableUuid?: string
}): Promise<StreamCommonData> {
  const endTime = Date.now()
  const duration = endTime - startTime
  return {
    uuid: generateUUIDIdentifier(),

    // AI Provider Data
    workspaceId: workspace.id,
    source: source,
    providerId: apiProvider.id,
    providerType: apiProvider.provider,
    // FIXME: This should be polymorphic
    // https://github.com/latitude-dev/latitude-llm/issues/229
    documentLogUuid: errorableUuid,

    // AI
    duration,
    generatedAt: new Date(),
    model: config.model,
    config: config,
    messages: messages,
    usage: await aiResult.data.usage,
  }
}

/**
 * This function is responsible for processing the AI response
 */
export async function processResponse({
  aiResult,
  startTime,
  workspace,
  source,
  apiProvider,
  config,
  messages,
  errorableUuid,
}: {
  aiResult: Awaited<AIReturn<StreamType>>
  startTime: number
  workspace: Workspace
  source: LogSources
  apiProvider: ProviderApiKey
  config: PartialConfig
  messages: Message[]
  errorableUuid?: string
}): Promise<ChainStepResponse<StreamType>> {
  const commonData = await buildCommonData({
    aiResult,
    startTime,
    workspace,
    source,
    apiProvider,
    config,
    messages,
    errorableUuid,
  })

  if (aiResult.type === 'text') {
    return processStreamText({ aiResult, commonData })
  }

  return processStreamObject({ aiResult, commonData })
}
