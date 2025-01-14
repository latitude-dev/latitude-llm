import type { Message } from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'

import {
  buildConversation,
  ChainEvent,
  ChainStepResponse,
  LogSources,
  ProviderApiKey,
  ProviderLog,
  StreamType,
  Workspace,
} from '../../browser'
import { unsafelyFindProviderApiKey } from '../../data-access'
import { NotFoundError, Result, TypedResult } from '../../lib'
import { ai, PartialConfig } from '../ai'
import { ChainError } from '../chains/ChainErrors'
import { ChainStreamConsumer } from '../chains/ChainStreamConsumer'
import { consumeStream } from '../chains/ChainStreamConsumer/consumeStream'
import { checkFreeProviderQuota } from '../chains/checkFreeProviderQuota'
import { checkValidStream } from '../chains/checkValidStream'
import { processResponse } from '../chains/ProviderProcessor'
import {
  buildProviderLogDto,
  saveOrPublishProviderLogs,
} from '../chains/ProviderProcessor/saveOrPublishProviderLogs'
import serializeProviderLog from './serialize'

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

  messages = [
    ...buildConversation(serializeProviderLog(providerLog)),
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
        messages,
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
  messages: Message[]
  source: LogSources
  documentLogUuid?: string
}) {
  try {
    await checkFreeProviderQuota({
      workspace,
      provider,
    }).then((r) => r.unwrap())

    const stepStartTime = Date.now()

    const aiResult = await ai({
      messages,
      config,
      provider,
    }).then((r) => r.unwrap())

    const checkResult = checkValidStream(aiResult)
    if (checkResult.error) throw checkResult.error

    const consumedStream = await consumeStream({
      controller,
      result: aiResult,
    })
    if (consumedStream.error) throw consumedStream.error

    const _response = await processResponse({
      aiResult,
      workspace,
      source,
      errorableUuid: documentLogUuid,
      config,
      apiProvider: provider,
      messages,
      startTime: stepStartTime,
    })

    const providerLog = await saveOrPublishProviderLogs({
      workspace,
      streamType: aiResult.type,
      finishReason: consumedStream.finishReason,
      data: buildProviderLogDto({
        workspace,
        source,
        provider,
        conversation: { messages, config },
        stepStartTime,
        errorableUuid: documentLogUuid,
        response: _response,
      }),
      saveSyncProviderLogs: true,
    })

    const response = { ..._response, providerLog }

    ChainStreamConsumer.chainCompleted({
      controller,
      response,
      config: {
        ...config,
        provider: provider.name,
        model: config.model,
      },
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
