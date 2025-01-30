import { AIReturn } from '../../ai'

export async function processStreamText({
  aiResult,
  documentLogUuid,
}: {
  aiResult: Awaited<AIReturn<'text'>>
  documentLogUuid?: string
}) {
  return {
    streamType: aiResult.type,
    documentLogUuid,
    text: await aiResult.data.text,
    usage: await aiResult.data.usage,
    toolCalls: (await aiResult.data.toolCalls).map((t) => ({
      id: t.toolCallId,
      name: t.toolName,
      arguments: t.args,
    })),
  }
}
