import type { Config, Message } from '@latitude-data/compiler'

import { PartialConfig } from '../../helpers'
import { Providers } from '../models'
import { applyAnthropicRules } from './anthropic'
import { applyCustomRules } from './custom'
import { applyGoogleRules } from './google'
import { AppliedRules } from './types'
import { vercelSdkRules } from './vercel'
import { applyOpenAiRules } from './openai'
import { applyVertexAnthropicRules } from './vertexAnthropic'
import { applyVertexGoogleRules } from './vertexGoogle'

type Props = {
  providerType: Providers
  messages: Message[]
  config: Config | PartialConfig
}

const RULES: Partial<Record<Providers, (props: AppliedRules) => AppliedRules>> =
  {
    [Providers.Anthropic]: applyAnthropicRules,
    [Providers.Google]: applyGoogleRules,
    [Providers.OpenAI]: applyOpenAiRules,
    [Providers.AnthropicVertex]: applyVertexAnthropicRules,
    [Providers.GoogleVertex]: applyVertexGoogleRules,
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

  const ruleFn = RULES[providerType]
  if (ruleFn) {
    rules = ruleFn(rules)
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
