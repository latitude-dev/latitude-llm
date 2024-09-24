import { Message, MessageRole } from '@latitude-data/compiler'
import { CoreTool, ObjectStreamPart, TextStreamPart } from 'ai'

import {
  ChainCallResponse,
  ChainEvent,
  ChainEventTypes,
  ChainObjectResponse,
  ChainTextResponse,
  DocumentLog,
  LogSources,
  objectToString,
  ProviderApiKey,
  ProviderData,
  StreamEventTypes,
  Workspace,
} from '../../../browser'
import { unsafelyFindProviderApiKey } from '../../../data-access'
import { NotFoundError, Result } from '../../../lib'
import { streamToGenerator } from '../../../lib/streamToGenerator'
import { ProviderLogsRepository } from '../../../repositories'
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
        documentLogUuid: documentLogUuid!,
        provider,
        controller,
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
  documentLogUuid,
  provider,
  controller,
  messages,
  source,
}: {
  workspace: Workspace
  config: PartialConfig
  documentLogUuid: DocumentLog['uuid']
  provider: ProviderApiKey
  controller: ReadableStreamDefaultController
  messages: Message[]
  source: LogSources
}) {
  try {
    const result = await ai({
      workspace,
      documentLogUuid,
      messages,
      config,
      provider,
      source,
    })

    for await (const value of streamToGenerator<
      TextStreamPart<Record<string, CoreTool>> | ObjectStreamPart<unknown>
    >(result.fullStream)) {
      enqueueChainEvent(controller, {
        event: StreamEventTypes.Provider,
        data: value as unknown as ProviderData,
      })
    }

    const response = {
      documentLogUuid,
      object: await result.object,
      text: await result.text,
      usage: await result.usage,
      providerLog: await result.providerLog,
      toolCalls: result.toolCalls
        ? (await result.toolCalls).map((t) => ({
            id: t.toolCallId,
            name: t.toolName,
            arguments: t.args,
          }))
        : [],
    } as ChainCallResponse

    enqueueChainEvent(controller, {
      event: StreamEventTypes.Latitude,
      data: {
        type: ChainEventTypes.Complete,
        config: { ...config, provider: provider.name, model: config.model },
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
          text:
            response.text ||
            objectToString((response as ChainObjectResponse).object),
        },
      },
    })

    controller.close()

    return {
      ...response,
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
