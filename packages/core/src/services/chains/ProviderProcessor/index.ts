import { ChainStepResponse, StreamType } from '../../../browser'
import { AIReturn } from '../../ai'
import { processStreamObject } from './processStreamObject'
import { processStreamText } from './processStreamText'

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
  if (aiResult.type === 'text') {
    return processStreamText({ aiResult, documentLogUuid })
  }

  return processStreamObject({ aiResult, documentLogUuid })
}
