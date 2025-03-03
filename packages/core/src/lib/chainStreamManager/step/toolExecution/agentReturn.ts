import { Result } from '../../../Result'
import { PromisedResult } from '../../../Transaction'
import { ToolResponsesArgs } from './types'

export function getAgentReturnToolCallsResults({
  toolCalls,
}: ToolResponsesArgs): PromisedResult<unknown>[] {
  return toolCalls.map(async () => {
    return Result.ok({})
  })
}
