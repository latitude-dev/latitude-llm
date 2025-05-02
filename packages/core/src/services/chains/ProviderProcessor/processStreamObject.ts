import { objectToString } from '@latitude-data/constants'
import { AIReturn } from '../../ai'

export async function processStreamObject({
  aiResult,
  documentLogUuid,
}: {
  aiResult: Awaited<AIReturn<'object'>>
  documentLogUuid?: string
}) {
  const object = await aiResult.object
  return {
    streamType: aiResult.type,
    documentLogUuid,
    usage: await aiResult.usage,
    text: objectToString(object),
    object,
  }
}
