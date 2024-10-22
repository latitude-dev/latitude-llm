import { Message } from '@latitude-data/compiler'

import { Providers } from '../models'
import { applyAntrhopicRules } from './anthropic'
import { applyGoogleRules } from './google'

export type AppliedRules = {
  didApplyCustomRules: boolean
  ruleMessage?: string
  messages: Message[]
}

export type ApplyCustomRulesProps = {
  messages: Message[]
}

export function applyCustomRules({
  providerType,
  messages,
}: ApplyCustomRulesProps & { providerType: Providers }): AppliedRules {
  if (providerType === Providers.Anthropic) {
    return applyAntrhopicRules({ messages })
  }

  if (providerType === Providers.Google) {
    return applyGoogleRules({ messages })
  }

  return {
    didApplyCustomRules: false,
    messages,
  }
}
