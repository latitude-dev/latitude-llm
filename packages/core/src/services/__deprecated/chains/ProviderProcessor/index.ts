import { ChainStepResponse, StreamType } from '../../../../browser'
import { AIReturn } from '../../../ai'

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

  return {
    streamType: aiResult.type,
    documentLogUuid,
    text,
    object: isObject ? parseObject(text) : undefined,
    usage: await aiResult.usage,
    reasoning: await aiResult.reasoning,
    toolCalls: (await aiResult.toolCalls).map((t) => ({
      id: t.toolCallId,
      name: t.toolName,
      arguments: t.args,
    })),
  }
}
