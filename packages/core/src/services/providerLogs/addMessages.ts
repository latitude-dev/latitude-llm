import {
  AssistantMessage,
  ContentType,
  Message,
  MessageRole,
} from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'

import {
  ChainEvent,
  ChainStepResponse,
  LogSources,
  objectToString,
  ProviderApiKey,
  ProviderLog,
  StreamType,
  Workspace,
} from '../../browser'
import { unsafelyFindProviderApiKey } from '../../data-access'
import { NotFoundError, Result, TypedResult } from '../../lib'
import { ai, PartialConfig } from '../ai'
import { ChainError } from '../chains/ChainErrors'
import {
  ChainStreamConsumer,
  parseResponseText,
} from '../chains/ChainStreamConsumer'
import { consumeStream } from '../chains/ChainStreamConsumer/consumeStream'
import { checkFreeProviderQuota } from '../chains/checkFreeProviderQuota'
import { ProviderProcessor } from '../chains/ProviderProcessor'

export type ChainResponse<T extends StreamType> = TypedResult<
  ChainStepResponse<T>,
  ChainError<RunErrorCodes>
>

export async function addMessages({
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
  if (!providerLog.providerId) {
    return Result.error(
      new NotFoundError(
        `Cannot add messages to a conversation that has no associated provider`,
      ),
    )
  }
  if (!providerLog.config) {
    return Result.error(
      new NotFoundError(
        `Cannot add messages to a conversation that has no associated configuration`,
      ),
    )
  }

  const provider = await unsafelyFindProviderApiKey(providerLog.providerId)
  if (!provider) {
    return Result.error(
      new NotFoundError(
        `Could not find provider API key with id ${providerLog.providerId}`,
      ),
    )
  }

  let responseResolve: (value: ChainResponse<StreamType>) => void

  const response = new Promise<ChainResponse<StreamType>>((resolve) => {
    responseResolve = resolve
  })

  const fmessages = [
    ...providerLog.messages,
    {
      role: MessageRole.assistant,
      content:
        providerLog.toolCalls.length > 0
          ? providerLog.toolCalls.map((t) => ({
              type: ContentType.toolCall,
              toolCallId: t.id,
              toolName: t.name,
              args: t.arguments,
            }))
          : providerLog.responseText ||
            objectToString(providerLog.responseObject),
    } as AssistantMessage,
    ...messages,
  ]

  const stream = new ReadableStream<ChainEvent>({
    start(controller) {
      iterate({
        workspace,
        source,
        config: providerLog.config!,
        provider,
        controller,
        documentLogUuid: providerLog.documentLogUuid!,
        messages: fmessages,
      })
        .then((res) => {
          responseResolve(Result.ok(res))
        })
        .catch((err) => {
          // TODO: createRunError in DB?
          responseResolve(Result.error(err))
        })
    },
  })

  return Result.ok({ stream, response })
}

async function iterate({
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
    await checkFreeProviderQuota({
      workspace,
      provider,
    }).then((r) => r.unwrap())

    const providerProcessor = new ProviderProcessor({
      workspace,
      source,
      errorableUuid: documentLogUuid,
      config,
      apiProvider: provider,
      messages,
      saveSyncProviderLogs: true,
    })
    const stepStartTime = Date.now()
    const result = await ai({
      messages,
      config,
      provider,
    }).then((r) => r.unwrap())
    const streamConsumedResult = await consumeStream({ controller, result })
    const response = await providerProcessor
      .call({
        aiResult: result,
        startTime: stepStartTime,
        finishReason: streamConsumedResult.finishReason,
      })
      .then((r) => r.unwrap())
    const providerLog = response.providerLog!
    const text = parseResponseText(response)
    ChainStreamConsumer.chainCompleted({
      controller,
      response: { ...response, providerLog, text },
      config: {
        ...config,
        provider: provider.name,
        model: config.model,
      },
    })

    return { ...response, providerLog, text }
  } catch (e) {
    const error = ChainStreamConsumer.chainError({
      controller,
      e,
    })

    throw error
  }
}
