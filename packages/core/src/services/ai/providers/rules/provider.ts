import { Providers } from '@latitude-data/constants'
import type { Message } from '@latitude-data/constants/messages'
import { applyAnthropicRules } from './anthropic'
import { applyCustomRules } from './custom'
import { applyGoogleRules } from './google'
import { applyOpenAiRules } from './openai'
import { applyPerplexityRules } from './perplexity'
import { AppliedRules } from './types'
import { applyVertexAnthropicRules } from './vertexAnthropic'
import { applyVertexGoogleRules } from './vertexGoogle'

export type Props = {
  providerType: Providers
  messages: Message[]
  config: AppliedRules['config']
}

export const RULES: Partial<
  Record<Providers, (props: AppliedRules) => AppliedRules>
> = {
  [Providers.AnthropicVertex]: applyVertexAnthropicRules,
  [Providers.Anthropic]: applyAnthropicRules,
  [Providers.GoogleVertex]: applyVertexGoogleRules,
  [Providers.Google]: applyGoogleRules,
  [Providers.OpenAI]: applyOpenAiRules,
  [Providers.Perplexity]: applyPerplexityRules,
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
