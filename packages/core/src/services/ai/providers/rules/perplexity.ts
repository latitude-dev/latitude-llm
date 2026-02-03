import { Message } from '@latitude-data/constants/messages'
import { AppliedRules } from './types'

export function applyPerplexityRules(appliedRule: AppliedRules): AppliedRules {
  // Ensure last message has role 'user'
  let messages = appliedRule.messages
  if (messages.length > 0 && messages[messages.length - 1]?.role !== 'user') {
    messages = [
      ...messages.slice(0, -1),
      {
        ...messages[messages.length - 1],
        role: 'user',
      },
    ] as Message[]
  }

  return {
    ...appliedRule,
    messages: messages as Message[],
    rules: appliedRule.rules,
  }
}
