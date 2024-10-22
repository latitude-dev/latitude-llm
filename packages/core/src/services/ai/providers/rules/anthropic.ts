import type { ContentType, MessageRole } from '@latitude-data/compiler'

import { AppliedRules, ApplyCustomRulesProps } from '.'

export function applyAntrhopicRules({
  messages,
}: ApplyCustomRulesProps): AppliedRules {
  if (!messages.some((m) => m.role === 'system')) {
    return {
      didApplyCustomRules: false,
      messages,
    }
  }

  return {
    didApplyCustomRules: true,
    ruleMessage:
      'Anthropic does not support system messages. All system messages have been converted to user messages.',
    messages: messages.map((m) => {
      if (m.role !== 'system') return m
      return {
        ...m,
        role: 'user' as MessageRole.user,
        content: [{ type: 'text' as ContentType.text, text: m.content }],
      }
    }),
  }
}
