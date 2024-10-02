import { Message, MessageRole } from '@latitude-data/compiler'
import { CoreTool, ObjectStreamPart, TextStreamPart } from 'ai'

import {
  ChainCallResponse,
  ChainEvent,
  ChainEventTypes,
  ChainObjectResponse,
  ChainTextResponse,
  LogSources,
  objectToString,
  ProviderApiKey,
  ProviderData,
  ProviderLog,
  StreamEventTypes,
  Workspace,
} from '../../browser'
import { unsafelyFindProviderApiKey } from '../../data-access'
import { NotFoundError, Result } from '../../lib'
import { streamToGenerator } from '../../lib/streamToGenerator'
import { ai, PartialConfig } from '../ai'
import { ProviderProcessor } from '../chains/ProviderProcessor'
import { enqueueChainEvent } from '../chains/run'

export async function addMessages({
  // TODO: We really don't need to pass the workspace here, we can get it from
  // the providerLog but it's currently kind of a pita to do so given the data
  // model so we can just pass it for now
  workspace,
  providerLog,
  messages,
  source,
}: {
  workspace: Workspace
  providerLog: ProviderLog
  messages: Message[]
  source: LogSources
}) {
  const provider = await unsafelyFindProviderApiKey(providerLog.providerId)
  if (!provider) {
    return Result.error(
      new NotFoundError(
        `Could not find provider API key with id ${providerLog.providerId}`,
      ),
    )
  }

  let responseResolve: (value: ChainCallResponse) => void
  let responseReject: (reason?: any) => void

  const response = new Promise<ChainCallResponse>((resolve, reject) => {
    responseResolve = resolve
    responseReject = reject
  })

  const stream = new ReadableStream<ChainEvent>({
    start(controller) {
      streamMessageResponse({
        workspace,
        source,
        config: providerLog.config,
        provider,
        controller,
        documentLogUuid: providerLog.documentLogUuid!,
        messages: [
          ...providerLog.messages,
          {
            role: MessageRole.assistant,
            content:
              providerLog.responseText ||
              objectToString(providerLog.responseObject),
            toolCalls: providerLog.toolCalls,
          },
          ...messages,
        ],
      })
        .then(responseResolve)
        .catch(responseReject)
    },
  })

  return Result.ok({ stream, response })
}

async function streamMessageResponse({
  workspace,
  config,
  provider,
  controller,
  messages,
  source,
  documentLogUuid,
}: {
  workspace: Workspace
  config: PartialConfig
  provider: ProviderApiKey
  controller: ReadableStreamDefaultController
  messages: Message[]
  source: LogSources
  documentLogUuid?: string
}) {
  try {
    const providerProcessor = new ProviderProcessor({
      source,
      documentLogUuid,
      config,
      apiProvider: provider,
      messages,
    })
    const result = await ai({
      workspace,
      messages,
      config,
      provider,
    })

    for await (const value of streamToGenerator<
      TextStreamPart<Record<string, CoreTool>> | ObjectStreamPart<unknown>
    >(result.data.fullStream)) {
      enqueueChainEvent(controller, {
        event: StreamEventTypes.Provider,
        data: value as unknown as ProviderData,
      })
    }

    const response = await providerProcessor.call({
      aiResult: result,
      saveSyncProviderLogs: true,
    })
    const providerLog = response.providerLog!

    enqueueChainEvent(controller, {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.Complete,
        config: { ...config, provider: provider.name, model: config.model },
        documentLogUuid,
        messages: [
          {
            role: MessageRole.assistant,
            toolCalls: (response as ChainTextResponse).toolCalls,
            content:
              response.text ||
              objectToString((response as ChainObjectResponse).object),
          },
        ],
        response: {
          ...response,
          providerLog,
          text:
            response.text ||
            objectToString((response as ChainObjectResponse).object),
        },
      },
    })

    controller.close()

    return {
      ...response,
      providerLog,
      text:
        response.text ||
        objectToString((response as ChainObjectResponse).object),
    }
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
