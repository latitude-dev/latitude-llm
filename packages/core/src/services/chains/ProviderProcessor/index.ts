import {
  ChainStepResponse,
  EMPTY_USAGE,
  StreamType,
} from '@latitude-data/constants/ai'
import { AIReturn, estimateCost } from '../../ai'
import {
  AssistantMessage,
  Message,
  MessageRole,
} from '@latitude-data/constants/messages'
import * as vercelSdkFromV5ToV4 from '../../../lib/vercelSdkFromV5ToV4'
import { convertResponseMessages } from '../../../lib/vercelSdkFromV5ToV4/convertResponseMessages'
import { ResolvedToolsDict } from '@latitude-data/constants/tools'
import { Providers } from '@latitude-data/constants'

function parseObject(text: string) {
  const parsed = text
  try {
    return JSON.parse(parsed)
  } catch {
    return {}
  }
}

/**
 * This function is responsible for processing the AI response
 */
export async function processResponse({
  aiResult,
  documentLogUuid,
  resolvedTools,
  model,
  provider,
  input,
}: {
  aiResult: Awaited<AIReturn<StreamType>>
  documentLogUuid?: string
  resolvedTools?: ResolvedToolsDict
  model: string
  provider: Providers
  input: Message[]
}): Promise<ChainStepResponse<StreamType>> {
  const isObject = aiResult.type === 'object'
  let text, response, reasoning, output, usage, toolCalls, cost
  try {
    reasoning = await aiResult.reasoning
    response = await aiResult.response
    text = await aiResult.text
    toolCalls = await aiResult.toolCalls
    usage = await aiResult.usage
    output = convertResponseMessages({
      messages: response.messages,
      resolvedTools,
    })
    cost = estimateCost({
      model,
      provider,
      usage: await vercelSdkFromV5ToV4.convertTokenUsage(usage),
    })
  } catch (_) {
    // do nothing
  }

  const v4ToolCalls = await vercelSdkFromV5ToV4.convertToolCalls(toolCalls)
  const toolCallsWithSourceData = v4ToolCalls?.map((toolCall) => {
    const resolvedTool = resolvedTools?.[toolCall.name]
    if (!resolvedTool) return toolCall

    return {
      ...toolCall,
      _sourceData: resolvedTool.sourceData,
    }
  })

  return {
    cost: cost ?? 0,
    model,
    provider,
    input,
    output: output ?? [],
    reasoning,
    documentLogUuid,
    text: text ?? '',
    streamType: aiResult.type,
    toolCalls: toolCallsWithSourceData,
    object: isObject ? parseObject(text ?? '') : undefined,
    usage: await vercelSdkFromV5ToV4.convertTokenUsage(usage),
  }
}

/**
 * When a assistant message is stopped by the user, we must create a uncomplete provider log with the information we
 * have to keep the message chain alive
 **/
export async function fakeResponse({
  documentLogUuid,
  accumulatedText,
}: {
  documentLogUuid?: string
  accumulatedText: { text: string }
}): Promise<ChainStepResponse<StreamType>> {
  return {
    streamType: 'text',
    documentLogUuid,
    text: accumulatedText.text,
    input: [
      {
        role: MessageRole.user,
        content: [
          {
            type: 'text',
            text: 'How u doing',
          },
        ],
      },
    ],
    output: [fakeAssistantMessage(accumulatedText.text)],
    usage: EMPTY_USAGE(),
    model: 'gpt-3.5-turbo',
    provider: Providers.OpenAI,
    cost: 14,
    reasoning: undefined,
    toolCalls: [],
  }
}

const fakeAssistantMessage = (accumulatedText: string): AssistantMessage => {
  return {
    role: MessageRole.assistant,
    content: [
      {
        type: 'text',
        text: accumulatedText,
      },
    ],
    toolCalls: [],
  }
}
