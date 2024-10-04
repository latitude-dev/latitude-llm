import { ChainStepResponse } from '../../../constants'
import { StreamCommonData } from '../../../events/handlers'
import { objectToString } from '../../../helpers'
import { AIReturn } from '../../ai'
import { saveOrPublishProviderLogs } from './saveOrPublishProviderLogs'

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
  saveSyncProviderLogs,
}: {
  commonData: StreamCommonData
  aiResult: Awaited<AIReturn<'object'>>
  saveSyncProviderLogs: boolean
}) {
  const response = await processResponse({ aiResult, commonData })
  const logsData = await createProviderLogData({
    response,
    commonData,
  })
  const providerLog = await saveOrPublishProviderLogs({
    streamType: aiResult.type,
    data: logsData,
    saveSyncProviderLogs,
  })

  return { ...response, providerLog }
}
