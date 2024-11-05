import type { Config, Message } from '@latitude-data/compiler'

import { PartialConfig } from '../../helpers'
import { Providers } from '../models'
import { applyAnthropicRules } from './anthropic'
import { applyGoogleRules } from './google'
import { vercelSdkRules } from './vercel'

export enum ProviderRules {
  Anthropic = 'anthropic',
  Google = 'google',
  VercelSDK = 'latitude',
}

type ProviderRule = { rule: ProviderRules; ruleMessage: string }

export type AppliedRules = {
  rules: ProviderRule[]
  messages: Message[]
  config: Config
}

type Props = {
  providerType: Providers
  messages: Message[]
  config: Config | PartialConfig
}

export function applyCustomRules({
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

  return vercelSdkRules(rules, providerType)
}
