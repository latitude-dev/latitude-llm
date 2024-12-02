import { ContentType, MessageRole } from '@latitude-data/compiler'

import { AppliedRules, ProviderRules } from '.'

export function applyCustomRules(rules: AppliedRules): AppliedRules {
  const hasNonTextSystemMessage = rules.messages.some(
    (message) =>
      message.role === MessageRole.system &&
      Array.isArray(message.content) &&
      message.content.some((content) => content.type !== ContentType.text),
  )

  if (hasNonTextSystemMessage) {
    rules.rules = [
      ...rules.rules,
      {
        rule: ProviderRules.Custom,
        ruleMessage: 'System messages can only have text content.',
      },
    ]
  }

  const hasAssistantMessageWithImage = rules.messages.some(
    (message) =>
      message.role === MessageRole.assistant &&
      Array.isArray(message.content) &&
      message.content.some((content) => content.type === ContentType.image),
  )

  if (hasAssistantMessageWithImage) {
    rules.rules = [
      ...rules.rules,
      {
        rule: ProviderRules.Custom,
        ruleMessage: 'Assistant messages cannot have images.',
      },
    ]
  }

  return rules
}
