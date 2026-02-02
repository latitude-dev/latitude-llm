import { Providers, VercelConfig } from '@latitude-data/constants'
import type { Message } from '@latitude-data/constants/legacyCompiler'
import { JSONValue, ModelMessage } from 'ai'
import { Provider, Translator } from 'rosetta-ai'
import { toCamelCaseDeep } from '../../../../lib/camelCaseRecursive'
import { applyAnthropicRules } from './anthropic'
import { applyCustomRules } from './custom'
import { applyGoogleRules } from './google'
import { applyOpenAiRules } from './openai'
import { applyPerplexityRules } from './perplexity'
import {
  extractMessageMetadata,
  getProviderMetadataKey,
} from './providerMetadata'
import { AppliedRules } from './types'
import { applyVertexAnthropicRules } from './vertexAnthropic'
import { applyVertexGoogleRules } from './vertexGoogle'

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

export type VercelConfigWithProviderRules = VercelConfig & {
  providerOptions: {
    [key: string]: Record<string, JSONValue>
  }
}

const translator = new Translator({
  filterEmptyMessages: true,
  providerMetadata: 'passthrough',
})

function convertLatitudeMessagesToVercelFormat({
  messages,
  provider,
}: {
  messages: Message[]
  provider: Providers
}): ModelMessage[] {
  const messagesWithMetadata = messages.map((message) =>
    extractMessageMetadata({ message, provider }),
  )

  const translated = translator.translate(messagesWithMetadata, {
    from: Provider.Promptl,
    to: Provider.VercelAI,
    direction: 'input',
  })

  return translated.messages as ModelMessage[]
}

export function applyAllRules({ providerType, messages, config }: Props) {
  let rules: AppliedRules = { rules: [], messages, config }
  rules = applyProviderRules({ providerType, messages, config: rules.config })

  const vercelMessages = convertLatitudeMessagesToVercelFormat({
    messages: rules.messages,
    provider: providerType,
  })

  const providerKey = getProviderMetadataKey(providerType)
  const providerOptions = toCamelCaseDeep(config)

  return {
    ...rules,
    messages: vercelMessages,
    config: {
      ...rules.config,
      providerOptions: {
        [providerKey]: providerOptions,
      },
    } as VercelConfigWithProviderRules,
  }
}
