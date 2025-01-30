import { objectToString } from '@latitude-data/constants'
import { AIReturn } from '../../ai'

export async function processStreamObject({
  aiResult,
  documentLogUuid,
}: {
  aiResult: Awaited<AIReturn<'object'>>
  documentLogUuid?: string
}) {
  const object = await aiResult.data.object
  return {
    streamType: aiResult.type,
    documentLogUuid,
    usage: await aiResult.data.usage,
    text: objectToString(object),
    object,
  }
}
