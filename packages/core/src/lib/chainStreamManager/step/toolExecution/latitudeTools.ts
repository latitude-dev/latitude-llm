import { ToolSource } from '../../resolveTools/types'
import { Result } from '../../../Result'
import { NotFoundError } from '../../../errors'
import { executeLatitudeToolCall } from '../../../../services/latitudeTools'
import { PromisedResult } from '../../../Transaction'
import { ToolResponsesArgs } from './types'

export function getLatitudeCallResults({
  toolCalls,
  resolvedTools,
}: ToolResponsesArgs): PromisedResult<unknown>[] {
  return toolCalls.map(async (toolCall) => {
    const toolSourceData = resolvedTools[toolCall.name]?.sourceData
    if (toolSourceData?.source !== ToolSource.Latitude) {
      return Result.error(new NotFoundError(`Unknown tool`))
    }

    const latitudeTool = toolSourceData.latitudeTool

    return executeLatitudeToolCall({ latitudeTool, args: toolCall.arguments })
  })
}
