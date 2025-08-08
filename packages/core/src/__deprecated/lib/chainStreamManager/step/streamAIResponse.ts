import { Conversation } from '@latitude-data/compiler'
import { VercelConfig } from '@latitude-data/constants'
import { FinishReason, LanguageModelUsage } from 'ai'
import { JSONSchema7 } from 'json-schema'
import {
  buildMessagesFromResponse,
  LogSources,
  ProviderApiKey,
  Workspace,
} from '../../../../browser'
import { ChainStepResponse, StreamType } from '../../../../constants'
import { ai } from '../../../../services/ai'
import { processResponse } from '../../../../services/chains/ProviderProcessor'
import {
  buildProviderLogDto,
  saveOrPublishProviderLogs,
} from '../../../../services/chains/ProviderProcessor/saveOrPublishProviderLogs'
import {
  getCachedResponse,
  setCachedResponse,
} from '../../../../services/commits/promptCache'
import { telemetry, TelemetryContext } from '../../../../telemetry'
import { consumeStream } from '../ChainStreamConsumer/consumeStream'
import { checkValidStream } from '../checkValidStream'
import { performAgentMessagesOptimization } from './agentOptimization'

type StreamProps = {
  context: TelemetryContext
  controller: ReadableStreamDefaultController
  workspace: Workspace
  provider: ProviderApiKey
  conversation: Conversation
  source: LogSources
  documentLogUuid: string
  schema?: JSONSchema7
  output?: 'object' | 'array' | 'no-schema'
  injectFakeAgentStartTool?: boolean
  abortSignal?: AbortSignal
}

export async function streamAIResponse({
  context,
  provider,
  conversation,
  injectFakeAgentStartTool,
  ...rest
}: StreamProps): Promise<{
  response: ChainStepResponse<StreamType>
  tokenUsage: LanguageModelUsage
}> {
  const optimizedAgentMessages = performAgentMessagesOptimization({
    messages: conversation.messages,
    injectFakeAgentStartTool,
  }).unwrap()
  conversation.messages = optimizedAgentMessages

  const $completion = telemetry.completion(context, {
    provider: provider.name,
    model: conversation.config.model as string,
    configuration: conversation.config,
    input: conversation.messages,
  })

  try {
    const result = executeAIResponse({
      context: $completion.context,
      provider,
      conversation,
      injectFakeAgentStartTool,
      ...rest,
    })

    result
      .then(({ response }) => {
        $completion.end({
          output: buildMessagesFromResponse({ response }),
          tokens: {
            prompt: response.usage.promptTokens,
            cached: 0, // Note: not given by Vercel AI SDK yet
            reasoning: 0, // Note: not given by Vercel AI SDK yet
            completion: response.usage.completionTokens,
          },
          finishReason: response.finishReason ?? 'unknown',
        })
      })
      .catch((error) => $completion.fail(error))

    return result
  } catch (error) {
    $completion.fail(error as Error)
    throw error
  }
}

export async function executeAIResponse({
  context,
  controller,
  workspace,
  provider,
  conversation,
  source,
  documentLogUuid,
  schema,
  output,
  abortSignal,
}: StreamProps): Promise<{
  response: ChainStepResponse<StreamType>
  tokenUsage: LanguageModelUsage
}> {
  if (abortSignal?.aborted) {
    throw new Error('Operation aborted by client')
  }

  const startTime = Date.now()

  const cachedResponse = await getCachedResponse({
    workspace,
    config: conversation.config,
    // TODO(compiler): fix types
    // @ts-expect-error - TODO: fix types
    conversation,
  })

  if (cachedResponse) {
    const providerLog = await saveOrPublishProviderLogs({
      workspace,
      finishReason:
        'finishReason' in cachedResponse
          ? (cachedResponse.finishReason as FinishReason)
          : 'stop',
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
    context,
    messages: conversation.messages,
    config: conversation.config as VercelConfig,
    provider,
    schema,
    output,
    abortSignal,
  }).then((r) => r.unwrap())

  const checkResult = checkValidStream({ type: aiResult.type })

  if (checkResult.error) throw checkResult.error

  const { error, finishReason } = await consumeStream({
    controller,
    result: aiResult,
  })

  if (error) throw error

  const processedResponse = await processResponse({
    aiResult,
    documentLogUuid,
  })

  const providerLog = await saveOrPublishProviderLogs({
    workspace,
    finishReason,
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
    // TODO(compiler)
    // @ts-expect-error - TODO: fix this
    conversation,
    response,
  })

  return {
    // TODO(compiler): fix types
    // @ts-expect-error - TODO: fix types
    response,
    tokenUsage: await aiResult.usage,
  }
}
