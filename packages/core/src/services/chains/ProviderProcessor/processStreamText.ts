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
    text: await aiResult.text,
    reasoning: await aiResult.reasoning,
    usage: await aiResult.usage,
    toolCalls: (await aiResult.toolCalls).map((t) => ({
      id: t.toolCallId,
      name: t.toolName,
      arguments: t.args,
    })),
  }
}
