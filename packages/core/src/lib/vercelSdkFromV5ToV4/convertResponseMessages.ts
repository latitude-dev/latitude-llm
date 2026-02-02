import { StreamType } from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import {
  AssistantMessage,
  ToolMessage,
} from '@latitude-data/constants/legacyCompiler'
import { ResolvedToolsDict } from '@latitude-data/constants/tools'
import { Provider, Translator } from 'rosetta-ai'
import { AIReturn } from '../../services/ai'

const translator = new Translator({
  filterEmptyMessages: true,
  providerMetadata: 'strip',
})

type AIMessages = Awaited<AIReturn<StreamType>['response']>['messages']
export type LegacyMessage = AssistantMessage | ToolMessage

export function convertResponseMessages({
  messages,
  resolvedTools,
}: {
  messages: AIMessages | undefined
  resolvedTools?: ResolvedToolsDict
}): LegacyMessage[] {
  if (!messages || messages.length === 0) return []
  for (const message of messages) {
    if (!['assistant', 'tool'].includes(message?.role)) {
      throw new ChainError({
        code: RunErrorCodes.InvalidResponseFormatError,
        message: `Unsupported provider message role: ${JSON.stringify(message, null, 2)} in response`,
      })
    }
  }

  const translated = translator.translate(messages, {
    from: Provider.VercelAI,
    to: Provider.Promptl,
    direction: 'output',
  })

  return translated.messages.map((message) => {
    if (message.role !== 'assistant') return message
    if (!Array.isArray(message.content)) return message

    const toolCalls = []
    for (const content of message.content) {
      if (content.type !== 'tool-call') continue

      // Adding tool source metadata to the tool call
      content._sourceData = resolvedTools?.[content.toolName]?.sourceData

      toolCalls.push({
        id: content.toolCallId,
        name: content.toolName,
        arguments: content.toolArguments ?? content.args ?? {},
        _sourceData: resolvedTools?.[content.toolName]?.sourceData,
      })
    }

    // TODO(compiler): Remove this once PromptL types have been consolidated
    // Duplicating tool calls in the assistant message for legacy compatibility
    message.toolCalls = toolCalls.length > 0 ? toolCalls : null

    return message
  }) as LegacyMessage[]
}
