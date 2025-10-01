import { ChainStepResponse, StreamType } from '../../../../browser'
import * as vercelSdkFromV5ToV4 from '../../../../lib/vercelSdkFromV5ToV4'
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
    usage: await vercelSdkFromV5ToV4.convertTokenUsage(aiResult.usage),
    reasoning: await aiResult.reasoning,
    toolCalls: await vercelSdkFromV5ToV4.convertToolCalls(aiResult.toolCalls),
  }
}
