import { AppliedRules, ProviderRules } from './types'

export function applyCustomRules(rules: AppliedRules): AppliedRules {
  const unsupportedSystemContent = rules.messages.some(
    (message) =>
      message.role === 'system' &&
      Array.isArray(message.content) &&
      message.content.some((content) => !['text'].includes(content.type)),
  )

  if (unsupportedSystemContent) {
    rules.rules = [
      ...rules.rules,
      {
        rule: ProviderRules.Custom,
        ruleMessage: 'System messages can only have text content.',
      },
    ]
  }

  const unsupportedAssistantContent = rules.messages.some(
    (message) =>
      message.role === 'assistant' &&
      Array.isArray(message.content) &&
      message.content.some(
        (content) => !['text', 'tool-call'].includes(content.type),
      ),
  )

  if (unsupportedAssistantContent) {
    rules.rules = [
      ...rules.rules,
      {
        rule: ProviderRules.Custom,
        ruleMessage:
          'Assistant messages can only have text or tool call content.',
      },
    ]
  }

  return rules
}
