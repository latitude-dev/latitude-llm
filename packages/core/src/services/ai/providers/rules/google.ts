import { enforceAllSystemMessagesFirst } from './helpers/enforceAllSystemMessagesFirst'
import { type AppliedRules, ProviderRules } from './types'

export function applyGoogleRules(appliedRule: AppliedRules): AppliedRules {
  return enforceAllSystemMessagesFirst(appliedRule, {
    provider: ProviderRules.Google,
    message:
      'Google only supports system messages at the beggining of the conversation. All other system messages have been converted to user messages.',
  })
}
