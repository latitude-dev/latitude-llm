import type { Message } from '@latitude-data/compiler'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'

import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import {
  buildConversation,
  ChainStepResponse,
  DocumentRunPromptSource,
  LogSources,
  PromptSource,
  ProviderLog,
  StreamType,
  TraceContext,
  Workspace,
} from '../../../../browser'
import { unsafelyFindProviderApiKey } from '../../../../data-access'
import { ChainStreamManager } from '../../../../lib/chainStreamManager'
import { telemetry, TelemetryContext } from '../../../../telemetry'
import { getInputSchema, getOutputType } from '../../../chains/ChainValidator'
import { checkFreeProviderQuota } from '../../../chains/checkFreeProviderQuota'
import serializeProviderLog from '../../../providerLogs/serialize'
import { NotFoundError } from './../../../../lib/errors'
import { Result, TypedResult } from './../../../../lib/Result'

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
  context,
  workspace,
  providerLog,
  source,
  globalConfig,
  messages: newMessages,
  promptSource,
  abortSignal,
}: {
  context: TelemetryContext
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

  let resolveTrace: (trace: TraceContext) => void
  const trace = new Promise<TraceContext>((resolve) => {
    resolveTrace = resolve
  })

  const $prompt = telemetry.prompt(context, {
    logUuid: providerLog.documentLogUuid!,
    versionUuid: (promptSource as DocumentRunPromptSource).commit.uuid,
    promptUuid: (promptSource as DocumentRunPromptSource).document.documentUuid,
    template: (promptSource as DocumentRunPromptSource).document.content,
    _internal: { source },
  })

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
      model: globalConfig.model,
    }).then((r) => r.unwrap())

    const { clientToolCalls } = await chainStreamManager.getProviderResponse({
      context: $prompt.context,
      provider,
      source,
      conversation,
      abortSignal,
      output: getOutputType({ config: conversation.config }),
      schema: getInputSchema({ config: conversation.config }),
    })

    const trace = telemetry.pause($prompt.context)
    resolveTrace(trace)

    // Pause the follow up if response has client tool calls
    // Chain is not cached because there is no chain anymore
    if (clientToolCalls.length) {
      chainStreamManager.requestTools(clientToolCalls, trace)
    }

    return { conversation, trace }
  })

  streamResult.lastResponse
    .then(async () => {
      const error = await streamResult.error
      if (error) $prompt.fail(error)
      else $prompt.end()
    })
    .catch((error) => $prompt.fail(error))

  return Result.ok({ ...streamResult, trace })
}
