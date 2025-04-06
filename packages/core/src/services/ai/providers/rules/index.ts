import type { Message } from '@latitude-data/compiler'

import { Providers } from '../models'
import { applyAnthropicRules } from './anthropic'
import { applyCustomRules } from './custom'
import { applyGoogleRules } from './google'
import { AppliedRules } from './types'
import { vercelSdkRules } from './vercel'
import { applyOpenAiRules } from './openai'
import { applyVertexAnthropicRules } from './vertexAnthropic'
import { applyVertexGoogleRules } from './vertexGoogle'
import { applyPerplexityRules } from './perplexity'
import { getProviderMetadataKey } from './providerMetadata'
import { JSONValue } from 'ai'
import { VercelConfig } from '@latitude-data/constants'
import { toCamelCaseDeep } from '../../../../lib'

type Props = {
  providerType: Providers
  messages: Message[]
  config: AppliedRules['config']
}

const RULES: Partial<Record<Providers, (props: AppliedRules) => AppliedRules>> =
  {
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

type VercelConfigWithProviderRules = VercelConfig & {
  providerOptions: {
    [key: string]: Record<string, JSONValue>
  }
}

export function applyAllRules({ providerType, messages, config }: Props) {
  let rules: AppliedRules = {
    rules: [],
    messages,
    config,
  }

  rules = applyProviderRules({ providerType, messages, config: rules.config })
  rules = vercelSdkRules(rules, providerType)

  const providerOptions = toCamelCaseDeep(config)
  return {
    ...rules,
    config: {
      ...rules.config,
      providerOptions: {
        [getProviderMetadataKey(providerType)]: providerOptions,
      },
    } as VercelConfigWithProviderRules,
  }
}
