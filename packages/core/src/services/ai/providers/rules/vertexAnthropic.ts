import { enforceAllSystemMessagesFirst } from './helpers/enforceAllSystemMessagesFirst'
import { AppliedRules, ProviderRules } from './types'

export function applyVertexAnthropicRules(
  appliedRule: AppliedRules,
): AppliedRules {
  const rule = enforceAllSystemMessagesFirst(appliedRule, {
    provider: ProviderRules.VertexAntropic,
    message:
      'Anthropic only supports system messages at the beggining of the conversation. All other system messages have been converted to user messages.',
  })

  const roles = rule.messages.map((m) => m.role)
  const onlySystemMessages = roles.every((r) => r === 'system')
  if (!onlySystemMessages) return rule

  const rules = [
    ...rule.rules,
    {
      rule: ProviderRules.VertexAntropic,
      ruleMessage:
        'Only system messages are present. You at least need one <user>your message</user> or <assistant>your message</assistant> in Anthropic.',
    },
  ]
  return {
    ...rule,
    rules,
  }
}
