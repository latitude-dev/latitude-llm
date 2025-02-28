import { JSONSchema7 } from 'json-schema'
import { Conversation } from '@latitude-data/compiler'
import { LogSources, ProviderApiKey, Workspace } from '../../../browser'
import {
  buildProviderLogDto,
  saveOrPublishProviderLogs,
} from '../../../services/chains/ProviderProcessor/saveOrPublishProviderLogs'
import { checkValidStream } from '../checkValidStream'
import { processResponse } from '../../../services/chains/ProviderProcessor'
import {
  getCachedResponse,
  setCachedResponse,
} from '../../../services/commits/promptCache'
import { ai } from '../../../services/ai'
import { ChainStepResponse, StreamType } from '../../../constants'
import { consumeStream } from '../ChainStreamConsumer/consumeStream'
import { LanguageModelUsage } from 'ai'
import { performAgentMessagesOptimization } from './agentOptimization'
import { VercelConfig } from '@latitude-data/constants'

export type ExecuteStepArgs = {
  controller: ReadableStreamDefaultController
  workspace: Workspace
  provider: ProviderApiKey
  conversation: Conversation
  source: LogSources
  documentLogUuid: string
  schema?: JSONSchema7
  output?: 'object' | 'array' | 'no-schema'
  injectFakeAgentStartTool?: boolean
  injectAgentFinishTool?: boolean
}

export async function streamAIResponse({
  controller,
  workspace,
  provider,
  conversation,
  source,
  documentLogUuid,
  schema,
  output,
  injectFakeAgentStartTool,
}: {
  controller: ReadableStreamDefaultController
  workspace: Workspace
  provider: ProviderApiKey
  conversation: Conversation
  source: LogSources
  documentLogUuid: string
  schema?: JSONSchema7
  output?: 'object' | 'array' | 'no-schema'
  injectFakeAgentStartTool?: boolean
}): Promise<{
  response: ChainStepResponse<StreamType>
  tokenUsage: LanguageModelUsage
}> {
  const startTime = Date.now()
  const cachedResponse = await getCachedResponse({
    workspace,
    config: conversation.config,
    conversation,
  })

  const optimizedAgentMessages = performAgentMessagesOptimization({
    messages: conversation.messages,
    injectFakeAgentStartTool,
  }).unwrap()

  if (cachedResponse) {
    const providerLog = await saveOrPublishProviderLogs({
      workspace,
      streamType: cachedResponse.streamType,
      finishReason: cachedResponse.finishReason ?? 'stop',
      data: buildProviderLogDto({
        workspace,
        source,
        provider,
        conversation,
        stepStartTime: startTime,
        errorableUuid: documentLogUuid,
        response: cachedResponse as ChainStepResponse<StreamType>,
      }),
      saveSyncProviderLogs: true, // TODO: temp bugfix, it should only save last one syncronously
    })

    const response = {
      ...cachedResponse,
      providerLog,
      documentLogUuid,
    } as ChainStepResponse<'text'>

    return {
      response,
      tokenUsage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    }
  }

  const aiResult = await ai({
    // TODO: vitest will cry when checking the parameters passed to this function when the object mutes afterwards.
    // To fix this, we make a deep copy of the array so that it is immutable.
    messages: optimizedAgentMessages,
    config: conversation.config as VercelConfig,
    provider,
    schema,
    output,
  }).then((r) => r.unwrap())

  const checkResult = checkValidStream(aiResult)
  if (checkResult.error) throw checkResult.error

  const consumedStream = await consumeStream({
    controller,
    result: aiResult,
  })
  if (consumedStream.error) throw consumedStream.error

  const processedResponse = await processResponse({
    aiResult,
    documentLogUuid,
  })

  const providerLog = await saveOrPublishProviderLogs({
    workspace,
    streamType: aiResult.type,
    finishReason: consumedStream.finishReason,
    data: buildProviderLogDto({
      workspace,
      source,
      provider,
      conversation,
      stepStartTime: startTime,
      errorableUuid: documentLogUuid,
      response: processedResponse,
    }),
    saveSyncProviderLogs: true, // TODO: temp bugfix, should only save last one syncronously
  })

  const response = { ...processedResponse, providerLog }

  await setCachedResponse({
    workspace,
    config: conversation.config,
    conversation,
    response,
  })

  return {
    response,
    tokenUsage: await aiResult.data.usage,
  }
}
