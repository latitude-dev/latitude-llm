import { Result } from '../../../../../lib/Result'
import type { PromisedResult } from '../../../../../lib/Transaction'
import type { ToolResponsesArgs } from './types'

export function getAgentReturnToolCallsResults({
  toolCalls,
}: ToolResponsesArgs): PromisedResult<unknown>[] {
  return toolCalls.map(async () => {
    return Result.ok({})
  })
}
