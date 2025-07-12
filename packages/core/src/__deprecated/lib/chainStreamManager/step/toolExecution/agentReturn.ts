import { Result } from '../../../../../lib/Result'
import { PromisedResult } from '../../../../../lib/Transaction'
import { ToolResponsesArgs } from './types'

export function getAgentReturnToolCallsResults({
  toolCalls,
}: ToolResponsesArgs): PromisedResult<unknown>[] {
  return toolCalls.map(async () => {
    return Result.ok({})
  })
}
