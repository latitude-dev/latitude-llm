import { Message } from '@latitude-data/compiler'
import { Result, TypedResult } from '../../../../../lib/Result'
import { LatitudeError } from '../../../../../lib/errors'
import { injectFakeStartAutonomousWorkflowMessages } from '../../../../../services/__deprecated/agents/promptInjection'

export function performAgentMessagesOptimization({
  messages,
  injectFakeAgentStartTool,
}: {
  messages: Message[]
  injectFakeAgentStartTool?: boolean
}): TypedResult<Message[], LatitudeError> {
  if (!injectFakeAgentStartTool) {
    return Result.ok(messages)
  }

  return Result.ok(injectFakeStartAutonomousWorkflowMessages(messages))
}
