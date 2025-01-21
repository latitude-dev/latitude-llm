import type { Config, Message } from '@latitude-data/compiler'

import { PartialConfig } from '../../helpers'
import { Providers } from '../models'
import { applyAnthropicRules } from './anthropic'
import { applyCustomRules } from './custom'
import { applyGoogleRules } from './google'
import { AppliedRules } from './types'
import { vercelSdkRules } from './vercel'
import { applyOpenAiRules } from './openai'

type Props = {
  providerType: Providers
  messages: Message[]
  config: Config | PartialConfig
}

export function applyProviderRules({
  providerType,
  messages,
  config,
}: Props): AppliedRules {
  let rules: AppliedRules = {
    rules: [],
    messages,
    config,
  }

  if (providerType === Providers.Anthropic) {
    rules = applyAnthropicRules(rules)
  }

  if (providerType === Providers.Google) {
    rules = applyGoogleRules(rules)
  }

  if (providerType === Providers.OpenAI) {
    rules = applyOpenAiRules(rules)
  }

  rules = applyCustomRules(rules)

  return rules
}

export function applyAllRules({
  providerType,
  messages,
  config,
}: Props): AppliedRules {
  let rules: AppliedRules = {
    rules: [],
    messages,
    config,
  }

  rules = applyProviderRules({ providerType, messages, config })
  rules = vercelSdkRules(rules, providerType)

  return rules
}
