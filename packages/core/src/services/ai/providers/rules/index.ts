import type { Message } from '@latitude-data/compiler'

import { Providers } from '../models'
import { applyAnthropicRules } from './anthropic'
import { applyGoogleRules } from './google'

export type ProviderRules =
  | 'AnthropicMultipleSystemMessagesUnsupported'
  | 'GoogleSingleStartingSystemMessageSupported'

export type AppliedRules = {
  rule: ProviderRules
  ruleMessage?: string
  messages: Message[]
}

export type ApplyCustomRulesProps = {
  messages: Message[]
}

export function applyCustomRules({
  providerType,
  messages,
}: ApplyCustomRulesProps & { providerType: Providers }):
  | AppliedRules
  | undefined {
  if (providerType === Providers.Anthropic) {
    return applyAnthropicRules({ messages })
  }

  if (providerType === Providers.Google) {
    return applyGoogleRules({ messages })
  }
}
