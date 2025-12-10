import {
  ChainStepResponse,
  StreamType,
  VercelConfig,
  LegacyVercelSDKVersion4Usage as LanguageModelUsage,
} from '@latitude-data/constants'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { JSONSchema7 } from 'json-schema'
import { LogSources } from '../../../constants'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { WorkspaceDto } from '../../../schema/models/types/Workspace'
import { ai, AIReturn } from '../../../services/ai'
import { processResponse } from '../../../services/chains/ProviderProcessor'
import { buildProviderLogDto } from '../../../services/chains/ProviderProcessor/saveOrPublishProviderLogs'
import { createProviderLog } from '../../../services/providerLogs/create'
import { assertUsageWithinPlanLimits } from '../../../services/workspaces/usage'
import { TelemetryContext } from '../../../telemetry'
import { consumeStream } from '../ChainStreamConsumer/consumeStream'
import { checkValidStream } from '../checkValidStream'
import { isAbortError } from '../../isAbortError'
import { createFakeProviderLog } from '../utils/createFakeProviderLog'
import { handleAIError } from './handleAIError'
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
  schema,
  output,
  abortSignal,
  resolvedTools,
}: {
  context: TelemetryContext
  controller: ReadableStreamDefaultController
  workspace: WorkspaceDto
  provider: ProviderApiKey
  messages: LegacyMessage[]
  config: VercelConfig
  source: LogSources
  documentLogUuid: string
  schema?: JSONSchema7
  output?: Output
  abortSignal?: AbortSignal
  resolvedTools?: ResolvedToolsDict
}): Promise<{
  response: ChainStepResponse<StreamType>
  messages: LegacyMessage[]
  tokenUsage: Awaited<LanguageModelUsage>
  finishReason: Awaited<AIReturn<StreamType>['finishReason']> | undefined
}> {
  await assertUsageWithinPlanLimits(workspace).then((r) => r.unwrap())

  const startTime = Date.now()
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
      await createFakeProviderLog({
        documentLogUuid,
        accumulatedText,
        workspace,
        source,
        provider,
        config,
        messages,
        startTime,
      })
    }

    throw error
  }

  if (chunkError) throw chunkError

  const processedResponse = await processResponse({
    aiResult,
    documentLogUuid,
    resolvedTools,
  })

  let finishReason
  try {
    finishReason = await aiResult.finishReason
  } catch (_) {
    // do nothing
  }

  const providerLog = await createProviderLog({
    workspace,
    finishReason,
    ...buildProviderLogDto({
      workspace,
      source,
      provider,
      conversation: {
        messages,
        config,
      },
      stepStartTime: startTime,
      errorableUuid: documentLogUuid,
      response: processedResponse,
    }),
  }).then((r) => r.unwrap())

  const response = processedResponse
  response.providerLog = providerLog

  return {
    response,
    // FIXME: Make response.output non optional when we remove `__deprecated`
    messages: response.output ?? [],
    tokenUsage: response.usage,
    finishReason,
  }
}
