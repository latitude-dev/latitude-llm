import { type ProviderApiKey } from '../../../../schema/models/types/ProviderApiKey'
import { Providers } from '@latitude-data/constants'
import {
  getModelsDevForProvider,
  type ModelsDevModel,
} from '../../estimateCost/modelsDev'

export const DEFAULT_PROVIDER_SUPPORTED_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
]

/**
 * Converts models.dev model list to the expected format
 */
function convertModelsDevToFormat(
  models: ModelsDevModel[],
): Record<string, string> {
  return Object.fromEntries(models.map((m) => [m.id, m.id]))
}

/**
 * Gets models for a provider from bundled models.dev data
 */
export function listModelsForProvider({
  provider,
  name,
  defaultProviderName,
}: {
  provider: Providers
  name?: string
  defaultProviderName?: string
}): Record<string, string> {
  // Map Latitude providers to models.dev provider names
  const providerNameMap: Record<Providers, string> = {
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

  const providerName = providerNameMap[provider] || provider
  const modelsDevData = getModelsDevForProvider(providerName)

  let result: Record<string, string> = {}
  if (modelsDevData && modelsDevData.length > 0) {
    result = convertModelsDevToFormat(modelsDevData)
  }

  // Filter to default supported models if this is the default provider
  if (name && name === defaultProviderName) {
    return Object.fromEntries(
      Object.entries(result).filter(([key]) =>
        DEFAULT_PROVIDER_SUPPORTED_MODELS.includes(key),
      ),
    )
  }

  return result
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

  if (models.find((model) => model === provider.defaultModel)) {
    return provider.defaultModel ?? undefined
  }

  return models[0]
}
