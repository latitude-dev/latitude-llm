import { type ProviderApiKey } from '../../../../schema/models/types/ProviderApiKey'
import { Providers } from '@latitude-data/constants'
import {
  getModelsDevForProvider,
  type ModelsDevModel,
} from '../../estimateCost/modelsDev'

// Re-export types for convenience
export type {
  ModelsDevModel,
  ModelModality,
  ModelModalities,
} from '../../estimateCost/modelsDev'

export const DEFAULT_PROVIDER_SUPPORTED_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
]

/**
 * Map Latitude providers to models.dev provider names
 */
const PROVIDER_NAME_MAP: Record<Providers, string> = {
  [Providers.OpenAI]: 'openai',
  [Providers.Anthropic]: 'anthropic',
  [Providers.Groq]: 'groq',
  [Providers.Mistral]: 'mistral',
  [Providers.Google]: 'google',
  [Providers.GoogleVertex]: 'google-vertex',
  [Providers.AnthropicVertex]: 'anthropic-vertex',
  [Providers.XAI]: 'xai',
  [Providers.AmazonBedrock]: 'bedrock',
  [Providers.DeepSeek]: 'deepseek',
  [Providers.Perplexity]: 'perplexity',
  [Providers.Azure]: 'azure',
  [Providers.Custom]: 'custom',
}

export function listModelsForProvider({
  provider,
  name,
  defaultProviderName,
}: {
  provider: Providers
  name?: string
  defaultProviderName?: string
}): ModelsDevModel[] {
  const providerName = PROVIDER_NAME_MAP[provider] || provider
  let models = getModelsDevForProvider(providerName)

  // Filter to default supported models if this is the default provider
  if (name && name === defaultProviderName) {
    models = models.filter((m) =>
      DEFAULT_PROVIDER_SUPPORTED_MODELS.includes(m.id),
    )
  }

  return models
}

export function findFirstModelForProvider({
  provider,
  defaultProviderName,
}: {
  provider?: ProviderApiKey
  defaultProviderName?: string
}): string | undefined {
  if (!provider) return undefined
  if (provider.provider === Providers.Custom) {
    return provider.defaultModel ?? undefined
  }

  const models = Object.values(
    listModelsForProvider({
      provider: provider.provider,
      name: provider.name,
      defaultProviderName,
    }),
  )

  if (models.find((model) => model.id === provider.defaultModel)) {
    return provider.defaultModel ?? undefined
  }

  return models[0]?.id
}
