import { JSONSchema7 } from 'json-schema'
import { Message } from '@latitude-data/compiler'
import { LogSources, ProviderApiKey, Workspace } from '../../browser'
import {
  buildProviderLogDto,
  saveOrPublishProviderLogs,
} from '../../services/chains/ProviderProcessor/saveOrPublishProviderLogs'
import { checkValidStream } from './checkValidStream'
import { processResponse } from '../../services/chains/ProviderProcessor'
import {
  getCachedResponse,
  setCachedResponse,
} from '../../services/commits/promptCache'
import { ai, Config as ValidatedConfig } from '../../services/ai'
import { ChainStepResponse, StreamType } from '../../constants'
import { ChainStreamConsumer } from './ChainStreamConsumer'
import { consumeStream } from './ChainStreamConsumer/consumeStream'

type ExecuteStepArgs = {
  controller: ReadableStreamDefaultController
  workspace: Workspace
  config: ValidatedConfig
  messages: Message[]
  newMessagesCount: number
  provider: ProviderApiKey
  source: LogSources
  errorableUuid: string
  chainCompleted?: boolean
  schema?: JSONSchema7
  output?: 'object' | 'array' | 'no-schema'
}

async function obtainAiResponse({
  controller,
  workspace,
  config,
  messages,
  provider,
  schema,
  output,
  startTime,
  chainCompleted = false,
  source,
  errorableUuid,
}: ExecuteStepArgs & { startTime: number }) {
  const conversation = { messages, config }

  const cachedResponse = await getCachedResponse({
    workspace,
    config,
    conversation: { messages, config },
  })

  if (cachedResponse) {
    const providerLog = await saveOrPublishProviderLogs({
      workspace,
      streamType: cachedResponse.streamType,
      finishReason: cachedResponse.finishReason ?? 'stop',
      chainCompleted,
      data: buildProviderLogDto({
        workspace,
        source,
        provider,
        conversation,
        stepStartTime: startTime,
        errorableUuid,
        response: cachedResponse as ChainStepResponse<StreamType>,
      }),
      saveSyncProviderLogs: true, // TODO: temp bugfix, it should only save last one syncronously
    })

    return {
      ...cachedResponse,
      providerLog,
      documentLogUuid: errorableUuid,
    } as ChainStepResponse<'text'>
  }

  const aiResult = await ai({
    messages,
    config,
    provider: provider,
    schema: schema,
    output: output,
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
    apiProvider: provider,
    config,
    errorableUuid,
    messages,
    source,
    workspace,
    startTime,
    chainCompleted,
    finishReason: consumedStream.finishReason,
  })

  const providerLog = await saveOrPublishProviderLogs({
    workspace,
    streamType: aiResult.type,
    finishReason: consumedStream.finishReason,
    chainCompleted,
    data: buildProviderLogDto({
      workspace,
      source,
      provider,
      conversation,
      stepStartTime: startTime,
      errorableUuid,
      response: processedResponse,
    }),
    saveSyncProviderLogs: true, // TODO: temp bugfix, should only save last one syncronously
  })

  const response = { ...processedResponse, providerLog }

  await setCachedResponse({
    workspace,
    config,
    conversation,
    response,
  })

  return response
}

export async function streamAIResponse(args: ExecuteStepArgs) {
  const startTime = Date.now()

  const {
    controller,
    messages,
    newMessagesCount,
    config,
    errorableUuid,
    chainCompleted,
  } = args

  const newMessages = messages.slice(messages.length - newMessagesCount)

  ChainStreamConsumer.startStep({
    controller,
    config,
    messages: newMessages, // Only send the messages that have been added to this step
    documentLogUuid: errorableUuid,
    isLastStep: chainCompleted,
  })

  const response = await obtainAiResponse({ ...args, startTime })

  ChainStreamConsumer.stepCompleted({
    controller,
    response,
  })

  return response
}
