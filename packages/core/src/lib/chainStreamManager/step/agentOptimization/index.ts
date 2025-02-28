import { Message } from '@latitude-data/compiler'
import { Result, TypedResult } from '../../../Result'
import { injectFakeStartAutonomousWorkflowMessages } from '../../../../services/agents/promptInjection'
import { LatitudeError } from '../../../errors'

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
