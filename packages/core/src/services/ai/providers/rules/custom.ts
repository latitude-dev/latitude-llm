import { AppliedRules, ProviderRules } from './types'

export function applyCustomRules(rules: AppliedRules): AppliedRules {
  const hasNonTextSystemMessage = rules.messages.some(
    (message) =>
      message.role === 'system' &&
      Array.isArray(message.content) &&
      message.content.some((content) => content.type !== 'text'),
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
      message.role === 'assistant' &&
      Array.isArray(message.content) &&
      message.content.some((content) => content.type === 'image'),
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
