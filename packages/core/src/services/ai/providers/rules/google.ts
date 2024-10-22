import { ContentType, MessageRole } from '@latitude-data/compiler'

import { AppliedRules, ApplyCustomRulesProps } from '.'

export function applyGoogleRules({
  messages,
}: ApplyCustomRulesProps): AppliedRules {
  const noChanges = {
    didApplyCustomRules: false,
    messages,
  }

  const firstNonSystemMessageIndex = messages.findIndex(
    (m) => m.role !== MessageRole.system,
  )

  if (firstNonSystemMessageIndex === -1) return noChanges

  const messagesAfterFirstNonSystemMessage = messages.slice(
    firstNonSystemMessageIndex,
  )

  if (
    !messagesAfterFirstNonSystemMessage.some(
      (m) => m.role === MessageRole.system,
    )
  ) {
    return noChanges
  }

  return {
    didApplyCustomRules: true,
    ruleMessage:
      'Google only supports system messages at the beggining of the conversation. All other system messages have been converted to user messages.',
    messages: messages.map((m, i) => {
      if (i < firstNonSystemMessageIndex) return m
      if (m.role !== MessageRole.system) return m
      return {
        ...m,
        role: MessageRole.user,
        content: [{ type: ContentType.text, text: m.content }],
      }
    }),
  }
}
