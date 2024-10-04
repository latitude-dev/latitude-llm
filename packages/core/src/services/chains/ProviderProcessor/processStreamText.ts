import { ChainStepResponse } from '../../../constants'
import { StreamCommonData } from '../../../events/events'
import { AIReturn } from '../../ai'
import { saveOrPublishProviderLogs } from './saveOrPublishProviderLogs'

async function processResponse({
  aiResult,
  commonData,
}: {
  commonData: StreamCommonData
  aiResult: Awaited<AIReturn<'text'>>
}): Promise<ChainStepResponse<'text'>> {
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

async function createProviderLogData({
  response,
  aiResult,
  commonData,
}: {
  response: Awaited<ReturnType<typeof processResponse>>
  aiResult: Awaited<AIReturn<'text'>>
  commonData: StreamCommonData
}) {
  return {
    ...commonData,
    responseText: await aiResult.data.text,
    toolCalls: response.toolCalls,
  }
}

export type TextProviderLogsData = ReturnType<typeof createProviderLogData>

export async function processStreamText({
  aiResult,
  commonData,
  saveSyncProviderLogs,
}: {
  commonData: StreamCommonData
  aiResult: Awaited<AIReturn<'text'>>
  saveSyncProviderLogs: boolean
}) {
  const response = await processResponse({ aiResult, commonData })
  const logsData = await createProviderLogData({
    response,
    aiResult,
    commonData,
  })
  const providerLog = await saveOrPublishProviderLogs({
    streamType: aiResult.type,
    data: logsData,
    saveSyncProviderLogs,
  })

  return { ...response, providerLog }
}
