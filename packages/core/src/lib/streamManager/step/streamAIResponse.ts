import { JSONSchema7 } from 'json-schema'
import {
  Conversation,
  Message as LegacyMessage,
} from '@latitude-data/constants/legacyCompiler'
import { LogSources, ProviderApiKey, Workspace } from '../../../browser'
import { buildProviderLogDto } from '../../../services/chains/ProviderProcessor/saveOrPublishProviderLogs'
import { checkValidStream } from '../checkValidStream'
import { processResponse } from '../../../services/chains/ProviderProcessor'
import { ai } from '../../../services/ai'
import { consumeStream } from '../ChainStreamConsumer/consumeStream'
import { VercelConfig } from '@latitude-data/constants'
import { createProviderLog } from '../../../services/providerLogs'
import { TelemetryContext } from '@latitude-data/telemetry'
import { telemetry } from '../../../telemetry'

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
}) {
  const $completion = telemetry.completion(context, {
    provider: provider.provider,
    model: config.model,
    configuration: config,
    input: messages,
  })
  const startTime = Date.now()

  try {
    // TODO(compiler): get response from cache
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

    const { error } = await consumeStream({
      controller,
      result: aiResult,
    })
    if (error) throw error

    const processedResponse = await processResponse({
      aiResult,
      documentLogUuid,
    })
    const responseMessages = (await aiResult.response)
      .messages as LegacyMessage[]
    const providerLog = await createProviderLog({
      workspace,
      finishReason: await aiResult.finishReason,
      ...buildProviderLogDto({
        workspace,
        source,
        provider,
        conversation: {
          messages: [...messages, ...responseMessages.slice(0, -1)],
          config,
        },
        stepStartTime: startTime,
        errorableUuid: documentLogUuid,
        response: processedResponse,
      }),
    }).then((r) => r.unwrap())
    const response = { ...processedResponse, providerLog }
    const usage = await aiResult.usage

    $completion.end({
      output: responseMessages,
      tokens: {
        prompt: usage.promptTokens,
        completion: usage.completionTokens,
        cached: 0, // TODO(telemetry): get cached tokens
        reasoning: 0, // TODO(telemetry): get reasoning tokens
      },
      finishReason: await aiResult.finishReason,
    })

    return {
      response,
      messages: responseMessages,
      tokenUsage: await aiResult.usage,
      finishReason: aiResult.finishReason,
    }
  } catch (e) {
    $completion.fail(e as Error)
    throw e
  }
}
