import {
  ChainStepResponse,
  StreamType,
  VercelConfig,
  LegacyVercelSDKVersion4Usage as LanguageModelUsage,
} from '@latitude-data/constants'
import {
  Conversation,
  Message as LegacyMessage,
} from '@latitude-data/constants/legacyCompiler'
import { JSONSchema7 } from 'json-schema'
import { LogSources } from '../../../constants'
import { ProviderApiKey, Workspace } from '../../../schema/types'
import { ai, AIReturn } from '../../../services/ai'
import { processResponse } from '../../../services/chains/ProviderProcessor'
import { buildProviderLogDto } from '../../../services/chains/ProviderProcessor/saveOrPublishProviderLogs'
import { createProviderLog } from '../../../services/providerLogs/create'
import { TelemetryContext } from '../../../telemetry'
import { consumeStream } from '../ChainStreamConsumer/consumeStream'
import { checkValidStream } from '../checkValidStream'
import { isAbortError } from '../../isAbortError'
import { createFakeProviderLog } from '../utils/createFakeProviderLog'

export type ExecuteStepArgs = {
  controller: ReadableStreamDefaultController
  workspace: Workspace
  provider: ProviderApiKey
  conversation: Conversation
  source: LogSources
  documentLogUuid: string
  schema?: JSONSchema7
  output?: 'object' | 'array' | 'no-schema'
  injectFakeAgentStartTool?: boolean
  injectAgentFinishTool?: boolean
}

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
}: {
  context: TelemetryContext
  controller: ReadableStreamDefaultController
  workspace: Workspace
  provider: ProviderApiKey
  messages: LegacyMessage[]
  config: VercelConfig
  source: LogSources
  documentLogUuid: string
  schema?: JSONSchema7
  output?: Output
  abortSignal?: AbortSignal
}): Promise<{
  response: ChainStepResponse<StreamType>
  messages: LegacyMessage[]
  tokenUsage: Awaited<LanguageModelUsage>
  finishReason: Awaited<AIReturn<StreamType>['finishReason']>
}> {
  const startTime = Date.now()
  const aiResult = await ai({
    context,
    messages,
    config,
    provider,
    schema,
    output,
    abortSignal,
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
  })

  const providerLog = await createProviderLog({
    workspace,
    finishReason: await aiResult.finishReason,
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
    finishReason: await aiResult.finishReason,
  }
}
