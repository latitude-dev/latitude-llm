import { Message } from '@latitude-data/compiler'
import { injectFakeStartAutonomousWorkflowMessages } from '../../../../services/agents/promptInjection'
import { VercelConfig } from '@latitude-data/constants'

const NO_TOOL = 'none' as const

export function performAgentMessagesOptimization({
  conversation,
  isFirstStep,
}: {
  conversation: { messages: Message[]; config: VercelConfig }
  isFirstStep?: boolean
}): { messages: Message[]; config: VercelConfig } {
  const messages = injectFakeStartAutonomousWorkflowMessages(
    conversation.messages,
  )

  const config = {
    ...(isFirstStep ? { toolChoice: NO_TOOL } : {}),
    ...conversation.config,
  }

  return { messages, config }
}
