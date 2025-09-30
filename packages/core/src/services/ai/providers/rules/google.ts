import { enforceAllSystemMessagesFirst } from './helpers/enforceAllSystemMessagesFirst'
import { AppliedRules, ProviderRules } from './types'

export function applyGoogleRules(appliedRule: AppliedRules): AppliedRules {
  const rules = enforceAllSystemMessagesFirst(appliedRule, {
    provider: ProviderRules.Google,
    message:
      'Google only supports system messages at the beggining of the conversation. All other system messages have been converted to user messages.',
  })

  const minOneUserMessage = rules.messages.some((m) => m.role === 'user')
  if (minOneUserMessage) return rules

  return {
    ...rules,
    rules: [
      ...rules.rules,
      {
        rule: ProviderRules.Google,
        ruleMessage: 'Google requires at least one user message',
      },
    ],
  }
}
