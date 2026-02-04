import type { Message } from '@latitude-data/constants/messages'

import { AppliedRules, ProviderRules } from '../types'

const SYSTEM_ROLE = 'system'

export function enforceAllSystemMessagesFirst(
  appliedRule: AppliedRules,
  ruleConfig: {
    provider: ProviderRules
    message: string
  },
): AppliedRules {
  const messages = appliedRule.messages
  const firstNonSystemMessageIndex = messages.findIndex(
    (m) => m.role !== SYSTEM_ROLE,
  )

  if (firstNonSystemMessageIndex === -1) {
    return appliedRule
  }

  const messagesAfterFirstNonSystemMessage = messages.slice(
    firstNonSystemMessageIndex,
  )
  if (!messagesAfterFirstNonSystemMessage.some((m) => m.role === SYSTEM_ROLE)) {
    return appliedRule
  }

  const rules = [
    ...appliedRule.rules,
    {
      rule: ruleConfig.provider,
      ruleMessage: ruleConfig.message,
    },
  ]
  return {
    ...appliedRule,
    rules,
    messages: messages.map((m, i) => {
      if (i < firstNonSystemMessageIndex) return m
      if (m.role !== SYSTEM_ROLE) return m

      return {
        ...m,
        role: 'user',
        content: Array.isArray(m.content)
          ? m.content
          : [{ type: 'text', text: m.content }],
      } as Message
    }),
  }
}
