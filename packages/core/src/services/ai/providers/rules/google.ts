import type { ContentType, MessageRole } from '@latitude-data/compiler'

import { AppliedRules, ApplyCustomRulesProps } from '.'

export function applyGoogleRules({
  messages,
}: ApplyCustomRulesProps): AppliedRules | undefined {
  const firstNonSystemMessageIndex = messages.findIndex(
    (m) => m.role !== 'system',
  )
  if (firstNonSystemMessageIndex === -1) return

  const messagesAfterFirstNonSystemMessage = messages.slice(
    firstNonSystemMessageIndex,
  )
  if (!messagesAfterFirstNonSystemMessage.some((m) => m.role === 'system'))
    return

  return {
    rule: 'GoogleSingleStartingSystemMessageSupported',
    ruleMessage:
      'Google only supports system messages at the beggining of the conversation. All other system messages have been converted to user messages.',
    messages: messages.map((m, i) => {
      if (i < firstNonSystemMessageIndex) return m
      if (m.role !== 'system') return m
      return {
        ...m,
        role: 'user' as MessageRole.user,
        content: [{ type: 'text' as ContentType.text, text: m.content }],
      }
    }),
  }
}
