import {
  ChainStepResponse,
  EMPTY_USAGE,
  StreamType,
} from '@latitude-data/constants/ai'
import { AIReturn } from '../../ai'
import {
  AssistantMessage,
  MessageRole,
} from '@latitude-data/constants/legacyCompiler'
import * as vercelSdkFromV5ToV4 from '../../../lib/vercelSdkFromV5ToV4'
import { convertResponseMessages } from '../../../lib/vercelSdkFromV5ToV4/convertResponseMessages'
import { ResolvedToolsDict } from '@latitude-data/constants/tools'

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
}: {
  aiResult: Awaited<AIReturn<StreamType>>
  documentLogUuid?: string
  resolvedTools?: ResolvedToolsDict
}): Promise<ChainStepResponse<StreamType>> {
  const isObject = aiResult.type === 'object'
  let text, response, reasoning, output, usage, toolCalls
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
    output,
    reasoning,
    documentLogUuid,
    streamType: aiResult.type,
    text: text ?? '',
    object: isObject ? parseObject(text ?? '') : undefined,
    usage: await vercelSdkFromV5ToV4.convertTokenUsage(usage),
    toolCalls: toolCallsWithSourceData,
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
    output: [fakeAssistantMessage(accumulatedText.text)],
    usage: EMPTY_USAGE(),
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
