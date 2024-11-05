import { ContentType, MessageRole } from '@latitude-data/compiler'

import { AppliedRules, ProviderRules } from '../index'

const system = MessageRole.system

export function enforceAllSystemMessagesFirst(
  appliedRule: AppliedRules,
  ruleConfig: {
    provider: ProviderRules
    message: string
  },
): AppliedRules {
  const messages = appliedRule.messages
  const firstNonSystemMessageIndex = messages.findIndex(
    (m) => m.role !== system,
  )

  if (firstNonSystemMessageIndex === -1) {
    return appliedRule
  }

  const messagesAfterFirstNonSystemMessage = messages.slice(
    firstNonSystemMessageIndex,
  )
  if (!messagesAfterFirstNonSystemMessage.some((m) => m.role === system)) {
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
      if (m.role !== system) return m

      return {
        ...m,
        role: MessageRole.user,
        content: Array.isArray(m.content)
          ? m.content
          : [{ type: ContentType.text, text: m.content }],
      }
    }),
  }
}
