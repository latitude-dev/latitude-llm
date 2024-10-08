import { ChainStepResponse } from '../../../constants'
import { StreamCommonData } from '../../../events/events'
import { objectToString } from '../../../helpers'
import { AIReturn } from '../../ai'

async function processResponse({
  aiResult,
  commonData,
}: {
  commonData: StreamCommonData
  aiResult: Awaited<AIReturn<'object'>>
}): Promise<ChainStepResponse<'object'>> {
  const object = await aiResult.data.object
  return {
    streamType: aiResult.type,
    documentLogUuid: commonData.documentLogUuid,
    usage: await aiResult.data.usage,
    text: objectToString(object),
    object,
  }
}

async function createProviderLogData({
  response,
  commonData,
}: {
  response: Awaited<ReturnType<typeof processResponse>>
  commonData: StreamCommonData
}) {
  return {
    ...commonData,
    responseObject: response.object,
  }
}

export type ObjectProviderLogsData = ReturnType<typeof createProviderLogData>

export async function processStreamObject({
  aiResult,
  commonData,
}: {
  commonData: StreamCommonData
  aiResult: Awaited<AIReturn<'object'>>
}) {
  const response = await processResponse({ aiResult, commonData })
  const providerLogsData = await createProviderLogData({
    response,
    commonData,
  })

  return { response, providerLogsData }
}
