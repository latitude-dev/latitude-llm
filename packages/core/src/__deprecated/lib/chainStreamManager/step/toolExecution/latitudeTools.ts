import { Result } from '../../../../../lib/Result'
import { PromisedResult } from '../../../../../lib/Transaction'
import { NotFoundError } from '../../../../../lib/errors'
import { executeLatitudeToolCall } from '../../../../../services/latitudeTools'
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
