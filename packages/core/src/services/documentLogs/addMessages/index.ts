import { Message, MessageRole } from '@latitude-data/compiler'

import {
  ChainCallResponse,
  ChainEvent,
  ChainEventTypes,
  DocumentLog,
  LogSources,
  ProviderApiKey,
  StreamEventTypes,
  Workspace,
} from '../../../browser'
import { Result } from '../../../lib'
import { streamToGenerator } from '../../../lib/streamToGenerator'
import {
  ProviderApiKeysRepository,
  ProviderLogsRepository,
} from '../../../repositories'
import { ai, PartialConfig } from '../../ai'
import { enqueueChainEvent } from '../../chains/run'

export async function addMessages({
  workspace,
  documentLogUuid,
  messages,
  source,
}: {
  workspace: Workspace
  documentLogUuid: string | undefined
  messages: Message[]
  source: LogSources
}) {
  const providerLogRepo = new ProviderLogsRepository(workspace.id)
  const providerLogResult =
    await providerLogRepo.findLastByDocumentLogUuid(documentLogUuid)

  if (providerLogResult.error) return providerLogResult

  const providerLog = providerLogResult.value

  const apiProviderRepo = new ProviderApiKeysRepository(workspace.id)
  const apiKeyResult = await apiProviderRepo.find(providerLog.providerId)
  if (apiKeyResult.error) return apiKeyResult

  const provider = apiKeyResult.value

  let responseResolve: (value: ChainCallResponse) => void
  let responseReject: (reason?: any) => void

  const response = new Promise<ChainCallResponse>((resolve, reject) => {
    responseResolve = resolve
    responseReject = reject
  })

  const stream = new ReadableStream<ChainEvent>({
    start(controller) {
      streamMessageResponse({
        source,
        config: providerLog.config,
        documentLogUuid: documentLogUuid!,
        provider,
        controller,
        messages: [
          ...providerLog.messages,
          {
            role: MessageRole.assistant,
            content: providerLog.responseText,
            toolCalls: providerLog.toolCalls,
          },
          ...messages,
        ],
      })
        .then(responseResolve)
        .catch(responseReject)
    },
  })

  // Dummy handling of the response
  // This is helpful for not throwing the error
  // when no one is listening to the promise
  response.then(() => {}).catch(() => {})
  return Result.ok({ stream, response })
}

async function streamMessageResponse({
  config,
  documentLogUuid,
  provider,
  controller,
  messages,
  source,
}: {
  config: PartialConfig
  documentLogUuid: DocumentLog['uuid']
  provider: ProviderApiKey
  controller: ReadableStreamDefaultController
  messages: Message[]
  source: LogSources
}) {
  try {
    const result = await ai({
      documentLogUuid,
      messages,
      config,
      provider,
      source,
    })

    for await (const value of streamToGenerator(result.fullStream)) {
      enqueueChainEvent(controller, {
        event: StreamEventTypes.Provider,
        data: value,
      })
    }

    const response = {
      documentLogUuid,
      text: await result.text,
      usage: await result.usage,
      toolCalls: (await result.toolCalls).map((t) => ({
        id: t.toolCallId,
        name: t.toolName,
        arguments: t.args,
      })),
    }
    enqueueChainEvent(controller, {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.Complete,
        config: { ...config, provider: provider.name, model: config.model },
        messages: [
          {
            role: MessageRole.assistant,
            toolCalls: response.toolCalls,
            content: response.text,
          },
        ],
        response,
      },
    })
    controller.close()
    return response
  } catch (e) {
    const error = e as Error
    enqueueChainEvent(controller, {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.Error,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      },
    })
    controller.close()
    throw error
  }
}
