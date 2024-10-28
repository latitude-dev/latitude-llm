import {
  AssistantMessage,
  ContentType,
  Message,
  MessageRole,
} from '@latitude-data/compiler'

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
import { NotFoundError, Result } from '../../lib'
import debug from '../../lib/debug'
import { ai, PartialConfig } from '../ai'
import {
  ChainStreamConsumer,
  parseResponseText,
} from '../chains/ChainStreamConsumer'
import { consumeStream } from '../chains/ChainStreamConsumer/consumeStream'
import { checkFreeProviderQuota } from '../chains/checkFreeProviderQuota'
import { ProviderProcessor } from '../chains/ProviderProcessor'

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
  const provider = await unsafelyFindProviderApiKey(providerLog.providerId)
  if (!provider) {
    return Result.error(
      new NotFoundError(
        `Could not find provider API key with id ${providerLog.providerId}`,
      ),
    )
  }

  let responseResolve: (value?: ChainStepResponse<StreamType>) => void

  const response = new Promise<ChainStepResponse<StreamType> | undefined>(
    (resolve) => {
      responseResolve = resolve
    },
  )

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
        config: providerLog.config,
        provider,
        controller,
        documentLogUuid: providerLog.documentLogUuid!,
        messages: fmessages,
      })
        .then(responseResolve)
        .catch((e) => {
          debug(`Error in addMessages: ${e}`)

          responseResolve()
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
