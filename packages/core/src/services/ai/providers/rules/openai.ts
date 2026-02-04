import { Message } from '@latitude-data/constants/messages'
import { AppliedRules, ProviderRules } from './types'

/**
 * OpenAI oficial 'o1' model supports system messages.
 * It's backward compatible but o1-mini and o1-preview doesn't support system messages.
 * VercelSKD removes these messages and the prompt fails.
 *
 * TODO: `o1-mini`and `o1-preview` are deprecated models. At some point we can remove this check.
 */
function doesSupportSystemMessages(modelId: string): boolean {
  if (modelId === 'o1') return true

  return modelId.startsWith('o1-') ? false : true
}

/**
 * TODO: Review these rules. I don't
 */
export function applyOpenAiRules(appliedRule: AppliedRules): AppliedRules {
  const config = appliedRule.config
  const model = config.model as string | undefined
  if (!model) return appliedRule

  const supportSystemMessages = doesSupportSystemMessages(model)
  const roles = appliedRule.messages.map((m) => m.role)
  const systemMessages = roles.filter((r) => r === 'system')
  const systemMessagesAllowed = supportSystemMessages || !systemMessages.length

  if (systemMessagesAllowed) return appliedRule

  const messages = appliedRule.messages.map((m) => {
    if (m.role === 'system') {
      return {
        ...m,
        role: 'user',
      }
    }
    return m
  })

  const rules = [
    ...appliedRule.rules,
    {
      rule: ProviderRules.OpenAI,
      ruleMessage:
        'Old reasoning models of OpenAI\'s "o1" family don\'t support system messages. These messages will be converted to <user>your text</user> to indicate user messages.',
    },
  ]
  return {
    ...appliedRule,
    messages: messages as Message[],
    rules,
  }
}
