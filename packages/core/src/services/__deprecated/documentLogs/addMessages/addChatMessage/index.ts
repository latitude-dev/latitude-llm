import type { Message } from '@latitude-data/compiler'
import { type ChainError, NotFoundError, type RunErrorCodes } from '@latitude-data/constants/errors'

import type { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { ChainStreamManager } from '../../../../../__deprecated/lib/chainStreamManager'
import {
  buildConversation,
  type ChainStepResponse,
  type LogSources,
  type PromptSource,
  type ProviderLog,
  type StreamType,
  type Workspace,
} from '../../../../../browser'
import { unsafelyFindProviderApiKey } from '../../../../../data-access'
import { Result, type TypedResult } from '../../../../../lib/Result'
import serializeProviderLog from '../../../../providerLogs/serialize'
import { getInputSchema, getOutputType } from '../../../chains/ChainValidator'
import { checkFreeProviderQuota } from '../../../chains/checkFreeProviderQuota'

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
  globalConfig,
  messages: newMessages,
  promptSource,
  abortSignal,
}: {
  workspace: Workspace
  providerLog: ProviderLog
  messages: Message[]
  globalConfig: LatitudePromptConfig
  source: LogSources
  promptSource: PromptSource
  abortSignal?: AbortSignal
}) {
  if (!providerLog.providerId) {
    return Result.error(
      new NotFoundError(`Cannot add messages to a conversation that has no associated provider`),
    )
  }

  const provider = await unsafelyFindProviderApiKey(providerLog.providerId)
  if (!provider) {
    return Result.error(
      new NotFoundError(`Could not find provider API key with id ${providerLog.providerId}`),
    )
  }

  const previousMessages = buildConversation(serializeProviderLog(providerLog))
  const conversation = {
    config: globalConfig,
    messages: [...previousMessages, ...newMessages],
  }

  const chainStreamManager = new ChainStreamManager({
    workspace,
    errorableUuid: providerLog.documentLogUuid!,
    // TODO(compiler): fix types
    // @ts-expect-error - TODO: fix types
    messages: conversation.messages,
    promptSource,
  })

  // TODO(compiler): fix types
  // @ts-expect-error - TODO: fix types
  const streamResult = chainStreamManager.start(async () => {
    await checkFreeProviderQuota({
      workspace,
      provider,
      model: globalConfig.model,
    }).then((r) => r.unwrap())

    const { clientToolCalls } = await chainStreamManager.getProviderResponse({
      provider,
      source,
      // TODO(compiler): fix types
      // @ts-expect-error - TODO: fix types
      conversation,
      abortSignal,
      output: getOutputType({ config: conversation.config }),
      schema: getInputSchema({ config: conversation.config }),
    })

    // Pause the follow up if response has client tool calls
    // Chain is not cached because there is no chain anymore
    if (clientToolCalls.length) {
      chainStreamManager.requestTools(clientToolCalls)
    }

    return { conversation }
  })

  return Result.ok(streamResult)
}
