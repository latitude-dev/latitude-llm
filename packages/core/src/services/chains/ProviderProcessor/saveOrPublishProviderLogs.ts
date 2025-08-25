import type { Conversation } from '@latitude-data/constants/legacyCompiler'
import type { FinishReason } from 'ai'

import type {
  ChainStepResponse,
  LogSources,
  ProviderLog,
  StreamType,
} from '@latitude-data/constants'
import type { ProviderApiKey, Workspace } from '../../../browser'
import { defaultQueue } from '../../../jobs/queues'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import type { PartialConfig } from '../../ai'
import { createProviderLog } from '../../providerLogs'

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

// TODO(compiler): remove
export async function saveOrPublishProviderLogs<
  S extends boolean,
  P = S extends true ? ProviderLog : void,
>({
  workspace,
  data,
  saveSyncProviderLogs,
  finishReason,
}: {
  workspace: Workspace
  data: ReturnType<typeof buildProviderLogDto>
  saveSyncProviderLogs: S
  finishReason: FinishReason
}): Promise<P> {
  const providerLogsData = {
    ...data,
    workspace,
    finishReason,
  }

  if (saveSyncProviderLogs) {
    const providerLog = await createProviderLog(providerLogsData).then((r) => r.unwrap())
    return providerLog as P
  }

  defaultQueue.add('createProviderLogJob', {
    ...providerLogsData,
    generatedAt: data.generatedAt.toISOString(),
  })
  return undefined as P
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
    responseObject: response.streamType === 'object' ? response.object : undefined,
    responseText: response.streamType === 'text' ? response.text : undefined,
    responseReasoning: response.streamType === 'text' ? response.reasoning : undefined,
    toolCalls: response.streamType === 'text' ? response.toolCalls : [],
  }
}
