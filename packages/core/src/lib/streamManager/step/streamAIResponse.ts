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
  const startTime = Date.now()
  // TODO(compiler): get response from cache

  const aiResult = await ai({
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

  const response = { ...processedResponse, providerLog }

  // TODO(compiler): save response to cache

  return {
    response,
    tokenUsage: await aiResult.usage,
    finishReason: aiResult.finishReason,
  }
}
