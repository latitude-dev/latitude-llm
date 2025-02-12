import { ProviderApiKey } from '../../../../schema/types'
import { Providers } from '@latitude-data/constants'
import { GROQ_MODELS } from '../../estimateCost/groq'
import { ANTHROPIC_MODELS } from '../../estimateCost/anthropic'
import { GOOGLE_MODELS } from '../../estimateCost/google'
import { MISTRAL_MODELS } from '../../estimateCost/mistral'
import { OPENAI_MODELS } from '../../estimateCost/openai'
import { VERTEX_GOOGLE_MODELS } from '../../estimateCost/vertexGoogle'
import { VERTEX_ANTHROPIC_MODELS } from '../../estimateCost/vertexAnthropic'

export { Providers } from '@latitude-data/constants'

export const DEFAULT_PROVIDER_SUPPORTED_MODELS = ['gpt-4o-mini', 'gpt-4o']

export const PROVIDER_MODELS: Partial<
  Record<Providers, Record<string, string>>
> = {
  [Providers.OpenAI]: OPENAI_MODELS.uiList,
  [Providers.Anthropic]: ANTHROPIC_MODELS.uiList,
  [Providers.Groq]: GROQ_MODELS.uiList,
  [Providers.Mistral]: MISTRAL_MODELS.uiList,
  [Providers.Google]: GOOGLE_MODELS.uiList,
  [Providers.GoogleVertex]: VERTEX_GOOGLE_MODELS.uiList,
  [Providers.AnthropicVertex]: VERTEX_ANTHROPIC_MODELS.uiList,
  [Providers.Azure]: {},
  [Providers.Custom]: {},
}

export function listModelsForProvider({
  provider,
  name,
  defaultProviderName,
}: {
  provider: Providers
  name?: string
  defaultProviderName?: string
}) {
  const models = PROVIDER_MODELS[provider]
  if (!models) return {}

  if (name && name === defaultProviderName) {
    return Object.fromEntries(
      Object.entries(models).filter(([key]) =>
        DEFAULT_PROVIDER_SUPPORTED_MODELS.includes(key),
      ),
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
}) {
  if (!provider) return undefined

  if (provider.provider === Providers.Custom) {
    return provider.defaultModel || undefined
  }

  const models = Object.values(
    listModelsForProvider({
      provider: provider.provider,
      name: provider.name,
      defaultProviderName,
    }),
  )

  if (models.find((model) => model === provider.defaultModel)) {
    return provider.defaultModel || undefined
  }

  return models[0]
}
