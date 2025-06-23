import { executeLatitudeToolCall } from '../../../../services/latitudeTools'
import { Result } from '../../../Result'
import { PromisedResult } from '../../../Transaction'
import { NotFoundError } from '../../../errors'
import { ToolSource } from '../../resolveTools/types'
import { ToolResponsesArgs } from './types'

export function getLatitudeCallResults({
  contexts,
  toolCalls,
  resolvedTools,
}: ToolResponsesArgs): PromisedResult<unknown>[] {
  return toolCalls.map(async (toolCall, idx) => {
    const toolSourceData = resolvedTools[toolCall.name]?.sourceData
    if (toolSourceData?.source !== ToolSource.Latitude) {
      return Result.error(new NotFoundError(`Unknown tool`))
    }

    const latitudeTool = toolSourceData.latitudeTool

    return executeLatitudeToolCall({
      context: contexts[idx]!,
      latitudeTool,
      args: toolCall.arguments,
    })
  })
}
