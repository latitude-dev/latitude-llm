import { objectToString } from '@latitude-data/constants'
import { StreamCommonData } from '../../../events/events'
import { AIReturn } from '../../ai'

export async function processStreamObject({
  aiResult,
  commonData,
}: {
  commonData: StreamCommonData
  aiResult: Awaited<AIReturn<'object'>>
}) {
  const object = await aiResult.data.object
  return {
    streamType: aiResult.type,
    documentLogUuid: commonData.documentLogUuid,
    usage: await aiResult.data.usage,
    text: objectToString(object),
    object,
  }
}
