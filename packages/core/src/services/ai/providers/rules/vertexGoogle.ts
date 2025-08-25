import { enforceAllSystemMessagesFirst } from './helpers/enforceAllSystemMessagesFirst'
import { type AppliedRules, ProviderRules } from './types'

export function applyVertexGoogleRules(appliedRule: AppliedRules): AppliedRules {
  const rule = enforceAllSystemMessagesFirst(appliedRule, {
    provider: ProviderRules.VertexGoogle,
    message:
      'Google Vertex only supports system messages at the beggining of the conversation. All other system messages have been converted to user messages.',
  })

  const roles = rule.messages.map((m) => m.role)
  const onlySystemMessages = roles.every((r) => r === 'system')
  if (!onlySystemMessages) return rule

  const rules = [
    ...rule.rules,
    {
      rule: ProviderRules.VertexGoogle,
      ruleMessage:
        'Only system messages are present. You at least need one <user>your message</user> or <assistant>your message</assistant> in Google Vertex.',
    },
  ]
  return {
    ...rule,
    rules,
  }
}
