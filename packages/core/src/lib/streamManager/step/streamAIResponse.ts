import {
  ChainStepResponse,
  StreamType,
  VercelConfig,
  LegacyVercelSDKVersion4Usage as LanguageModelUsage,
} from '@latitude-data/constants'
import type { Message } from '@latitude-data/constants/messages'
import { JSONSchema7 } from 'json-schema'
import { LogSources } from '../../../constants'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { WorkspaceDto } from '../../../schema/models/types/Workspace'
import { ai, AIReturn } from '../../../services/ai'
import { processResponse } from '../../../services/chains/ProviderProcessor'
import { writeConversationCache } from '../../../services/conversations/cache'
import { assertUsageWithinPlanLimits } from '../../../services/workspaces/usage'
import { TelemetryContext } from '../../../telemetry'
import { consumeStream } from '../ChainStreamConsumer/consumeStream'
import { checkValidStream } from '../checkValidStream'
import { isAbortError } from '../../isAbortError'
import { handleAIError } from './handleAIError'
import { recordAbortedCompletion } from './recordAbortedCompletion'
import { ResolvedToolsDict } from '@latitude-data/constants/tools'

export type Output = 'object' | 'array' | 'no-schema'

export async function streamAIResponse({
  context,
  controller,
  workspace,
  provider,
  messages,
  config,
  source,
  documentLogUuid,
  conversationContext,
  schema,
  output,
  abortSignal,
  resolvedTools,
}: {
  context: TelemetryContext
  controller: ReadableStreamDefaultController
  workspace: WorkspaceDto
  provider: ProviderApiKey
  messages: Message[]
  config: VercelConfig
  source: LogSources
  documentLogUuid: string
  conversationContext?: { commitUuid: string; documentUuid: string }
  schema?: JSONSchema7
  output?: Output
  abortSignal?: AbortSignal
  resolvedTools?: ResolvedToolsDict
}): Promise<{
  response: ChainStepResponse<StreamType>
  messages: Message[]
  tokenUsage: Awaited<LanguageModelUsage>
  finishReason: Awaited<AIReturn<StreamType>['finishReason']> | undefined
}> {
  void source
  await assertUsageWithinPlanLimits(workspace).then((r) => r.unwrap())

  const aiResult = await ai({
    context,
    messages,
    config,
    provider,
    schema,
    output,
    abortSignal,
    onError: handleAIError,
  }).then((r) => r.unwrap())

  const checkResult = checkValidStream({ type: aiResult.type })
  if (checkResult.error) throw checkResult.error
  const accumulatedText = { text: '' }

  let chunkError
  try {
    const resultStream = await consumeStream({
      controller,
      result: aiResult,
      accumulatedText,
      resolvedTools,
    })
    chunkError = resultStream.error
  } catch (error) {
    if (isAbortError(error)) {
      recordAbortedCompletion({
        context,
        provider,
        config,
        messages,
        accumulatedText: accumulatedText.text,
      })
    }

    throw error
  }

  if (chunkError) throw chunkError

  const processedResponse = await processResponse({
    aiResult,
    documentLogUuid,
    resolvedTools,
    input: messages,
    model: config.model,
    provider: provider.provider,
  })

  let finishReason
  try {
    finishReason = await aiResult.finishReason
  } catch (_) {
    // do nothing
  }

  const response = processedResponse

  if (conversationContext) {
    await writeConversationCache({
      documentLogUuid,
      workspaceId: workspace.id,
      commitUuid: conversationContext.commitUuid,
      documentUuid: conversationContext.documentUuid,
      providerId: provider.id,
      messages: [...messages, ...(response.output ?? [])],
    }).then((r) => r.unwrap())
  }

  return {
    response,
    // FIXME: Make response.output non optional when we remove `__deprecated`
    messages: response.output ?? [],
    tokenUsage: response.usage,
    finishReason,
  }
}
