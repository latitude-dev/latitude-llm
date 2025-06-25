import type { Message } from '@latitude-data/constants/legacyCompiler'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'

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
import serializeProviderLog from '../../../providerLogs/serialize'
import { NotFoundError } from './../../../../lib/errors'
import { Result } from './../../../../lib/Result'
import { TypedResult } from './../../../../lib/Result'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { VercelConfig } from '@latitude-data/constants'
import { DefaultStreamManager } from '../../../../lib/streamManager/defaultStreamManager'
import { getInputSchema, getOutputType } from '../../../chains/ChainValidator'

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
      new NotFoundError(
        `Cannot add messages to a conversation that has no associated provider`,
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
    config: globalConfig,
    messages: [...previousMessages, ...newMessages],
  }

  const streamManager = new DefaultStreamManager({
    uuid: providerLog.documentLogUuid!,
    config: conversation.config as VercelConfig,
    provider,
    output: getOutputType(conversation)!,
    schema: getInputSchema(conversation)!,
    messages: conversation.messages,
    promptSource,
    source,
    workspace,
    abortSignal,
  })

  const { start, ...streamResult } = streamManager.prepare()

  start()

  return Result.ok(streamResult)
}
