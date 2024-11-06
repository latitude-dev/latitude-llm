import { StreamCommonData } from '../../../events/events'
import { AIReturn } from '../../ai'

export async function processStreamText({
  aiResult,
  commonData,
}: {
  commonData: StreamCommonData
  aiResult: Awaited<AIReturn<'text'>>
}) {
  return {
    streamType: aiResult.type,
    documentLogUuid: commonData.documentLogUuid,
    text: await aiResult.data.text,
    usage: await aiResult.data.usage,
    toolCalls: (await aiResult.data.toolCalls).map((t) => ({
      id: t.toolCallId,
      name: t.toolName,
      arguments: t.args,
    })),
  }
}
