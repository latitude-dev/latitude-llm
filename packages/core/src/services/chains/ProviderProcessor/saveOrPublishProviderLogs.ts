import { Conversation } from '@latitude-data/constants/messages'
import { FinishReason } from 'ai'

import {
  ChainStepResponse,
  LogSources,
  StreamType,
} from '@latitude-data/constants'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import { PartialConfig } from '../../ai'
import { createProviderLog } from '../../providerLogs/create'

export async function saveProviderLog({
  workspace,
  data,
  finishReason,
}: {
  workspace: Workspace
  data: ReturnType<typeof buildProviderLogDto>
  finishReason: FinishReason
}) {
  const providerLogsData = {
    ...data,
    workspace,
    finishReason,
  }

  return await createProviderLog(providerLogsData)
}

export function buildProviderLogDto({
  workspace,
  source,
  provider,
  conversation,
  stepStartTime,
  errorableUuid,
  response,
}: {
  workspace: Workspace
  source: LogSources
  provider: ProviderApiKey
  conversation: Conversation
  stepStartTime: number
  errorableUuid?: string
  response: ChainStepResponse<StreamType>
}) {
  return {
    uuid: generateUUIDIdentifier(),

    // AI Provider Data
    workspaceId: workspace.id,
    source: source,
    providerId: provider.id,
    providerType: provider.provider,
    documentLogUuid: errorableUuid,

    // AI
    duration: Date.now() - stepStartTime,
    generatedAt: new Date(),
    model: conversation.config.model as string,
    config: conversation.config as PartialConfig,
    messages: conversation.messages,
    usage: response.usage,
    output: response.output,
    responseObject:
      response.streamType === 'object' ? response.object : undefined,
    responseText: response.streamType === 'text' ? response.text : undefined,
    responseReasoning:
      response.streamType === 'text' ? response.reasoning : undefined,
    toolCalls: response.streamType === 'text' ? response.toolCalls : [],
  }
}
