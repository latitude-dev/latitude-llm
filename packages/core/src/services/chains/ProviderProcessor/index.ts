import { ChainStepResponse, StreamType } from '@latitude-data/constants/ai'
import { AIReturn } from '../../ai'
import {
  AssistantMessage,
  ToolCall,
} from '@latitude-data/constants/legacyCompiler'

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
}: {
  aiResult: Awaited<AIReturn<StreamType>>
  documentLogUuid?: string
}): Promise<ChainStepResponse<StreamType>> {
  const isObject = aiResult.type === 'object'
  const text = await aiResult.text
  const output = await buildOutput(aiResult)

  console.log('TOOL CALLS', JSON.stringify(aiResult.toolCalls, null, 2))

  return {
    streamType: aiResult.type,
    documentLogUuid,
    text,
    object: isObject ? parseObject(text) : undefined,
    output,
    usage: await aiResult.usage,
    reasoningText: await aiResult.reasoningText,
    toolCalls: (await aiResult.toolCalls).map((t) => ({
      id: t.toolCallId,
      name: t.toolName,
      arguments: t.input as unknown as ToolCall['arguments'],
    })),
  }
}

async function buildOutput(
  aiResult: AIReturn<StreamType>,
): Promise<ChainStepResponse<StreamType>['output']> {
  const messages = (await aiResult.response).messages
  if (!messages) return []

  return messages.map((m) => {
    if (m.role === 'assistant') {
      return {
        role: 'assistant',
        content: m.content,
      } as AssistantMessage
    } else {
      return {
        role: 'tool',
        content: m.content,
      }
    }
  })
}
