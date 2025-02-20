import type { Message } from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'

import {
  buildConversation,
  ChainStepResponse,
  LogSources,
  StreamType,
  Workspace,
  ProviderLog,
  PromptSource,
} from '../../../../browser'
import { unsafelyFindProviderApiKey } from '../../../../data-access'
import { NotFoundError, Result, TypedResult } from '../../../../lib'
import { ChainError } from '../../../../lib/chainStreamManager/ChainErrors'
import { checkFreeProviderQuota } from '../../../chains/checkFreeProviderQuota'
import serializeProviderLog from '../../../providerLogs/serialize'
import { ChainStreamManager } from '../../../../lib/chainStreamManager'

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
  messages: newMessages,
  promptSource,
}: {
  workspace: Workspace
  providerLog: ProviderLog
  messages: Message[]
  source: LogSources
  promptSource: PromptSource
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

  const previousMessages = buildConversation(serializeProviderLog(providerLog))
  const conversation = {
    config: {
      ...providerLog.config!,
      provider: provider.name,
    },
    messages: [...previousMessages, ...newMessages],
  }

  const chainStreamManager = new ChainStreamManager({
    workspace,
    errorableUuid: providerLog.documentLogUuid!,
    messages: conversation.messages,
    promptSource,
  })

  const streamResult = chainStreamManager.start(async () => {
    await checkFreeProviderQuota({
      workspace,
      provider,
    }).then((r) => r.unwrap())

    await chainStreamManager.getProviderResponse({
      workspace,
      provider,
      source,
      documentLogUuid: providerLog.documentLogUuid!,
      conversation,
    })
  })

  return Result.ok(streamResult)
}
