import type { Message } from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'

import {
  buildConversation,
  buildMessagesFromResponse,
  ChainEvent,
  ChainStepResponse,
  LogSources,
  ProviderApiKey,
  StreamType,
  Workspace,
  ProviderLog,
} from '../../../../browser'
import { unsafelyFindProviderApiKey } from '../../../../data-access'
import { NotFoundError, Result, TypedResult } from '../../../../lib'
import { Config as ValidatedConfig, PartialConfig } from '../../../ai'
import { ChainError } from '../../../../lib/streamManager/ChainErrors'
import { ChainStreamConsumer } from '../../../../lib/streamManager/ChainStreamConsumer'
import { checkFreeProviderQuota } from '../../../chains/checkFreeProviderQuota'
import { streamAIResponse } from '../../../../lib/streamManager'
import serializeProviderLog from '../../../providerLogs/serialize'

export type ChainResponse<T extends StreamType> = TypedResult<
  ChainStepResponse<T>,
  ChainError<RunErrorCodes>
>
/**
 * Add chat message
 * ::::::::::::::::::::
 * Adds an additional message to a finished conversation, and generates
 * a single response.
 */
export async function addChatMessage({
  workspace,
  providerLog,
  source,
  messages,
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

  const previousMessages = buildConversation(serializeProviderLog(providerLog))

  const stream = new ReadableStream<ChainEvent>({
    start(controller) {
      iterate({
        workspace,
        source,
        config: providerLog.config!,
        provider,
        controller,
        documentLogUuid: providerLog.documentLogUuid!,
        messages: [...previousMessages, ...messages],
      })
        .then((res) => {
          responseResolve(Result.ok(res))
        })
        .catch((err) => {
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
  source: LogSources
  messages: Message[]
  documentLogUuid?: string
}) {
  try {
    await checkFreeProviderQuota({
      workspace,
      provider,
    }).then((r) => r.unwrap())

    const response = await streamAIResponse({
      controller,
      workspace,
      config: config as ValidatedConfig,
      messages,
      newMessagesCount: 0,
      provider,
      source,
      errorableUuid: documentLogUuid!,
    })

    const responseMessages = buildMessagesFromResponse({ response })

    ChainStreamConsumer.chainCompleted({
      controller,
      response,
      config: {
        ...config,
        provider: provider.name,
        model: config.model,
      },
      finishReason: response.finishReason ?? 'stop',
      responseMessages,
    })

    return response
  } catch (e) {
    const error = ChainStreamConsumer.chainError({
      controller,
      e,
    })

    throw error
  }
}
