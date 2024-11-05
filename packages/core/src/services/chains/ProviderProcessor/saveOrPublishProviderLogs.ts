import { Conversation } from '@latitude-data/compiler'
import { FinishReason } from 'ai'

import { ProviderApiKey, Workspace } from '../../../browser'
import { ChainStepResponse, LogSources, StreamType } from '../../../constants'
import { AIProviderCallCompletedData } from '../../../events/events'
import { publisher } from '../../../events/publisher'
import { setupJobs } from '../../../jobs'
import { generateUUIDIdentifier } from '../../../lib'
import { PartialConfig } from '../../ai'
import { createProviderLog } from '../../providerLogs'

export async function saveOrPublishProviderLogs({
  workspace,
  data,
  streamType,
  saveSyncProviderLogs,
  finishReason,
}: {
  workspace: Workspace
  streamType: StreamType
  data: ReturnType<typeof buildProviderLogDto>
  saveSyncProviderLogs: boolean
  finishReason: FinishReason
}) {
  publisher.publishLater({
    type: 'aiProviderCallCompleted',
    data: { ...data, streamType } as AIProviderCallCompletedData<
      typeof streamType
    >,
  })

  const providerLogsData = {
    ...data,
    workspace,
    finishReason,
  }

  if (saveSyncProviderLogs) {
    const providerLog = await createProviderLog(providerLogsData).then((r) =>
      r.unwrap(),
    )
    return providerLog
  }

  const queues = await setupJobs()
  queues.defaultQueue.jobs.enqueueCreateProviderLogJob({
    ...providerLogsData,
    generatedAt: data.generatedAt.toISOString(),
  })
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
    responseObject:
      response.streamType === 'object' ? response.object : undefined,
    responseText: response.streamType === 'text' ? response.text : undefined,
    toolCalls: response.streamType === 'text' ? response.toolCalls : [],
  }
}
