import type { LanguageModel } from 'ai'
import { ProviderAuthError, UnsupportedProviderError } from '../errors'
import type { ModelsDevProvider } from '../models/modelsDev'

type ProviderFactory = (
  apiKey?: string,
  provider?: ModelsDevProvider,
) => Promise<(modelId: string) => LanguageModel>

async function loadProvider<T>(
  packageName: string,
  factoryName: string,
): Promise<T> {
  try {
    const module = (await import(packageName)) as Record<string, unknown>
    const factory = module[factoryName] as T | undefined
    if (!factory) {
      throw new UnsupportedProviderError(
        `Provider package '${packageName}' is missing '${factoryName}' export`,
      )
    }

    return factory
  } catch (error) {
    if (error instanceof UnsupportedProviderError) throw error

    throw new UnsupportedProviderError(
      `Provider package '${packageName}' is not installed`,
    )
  }
}

const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  '@ai-sdk/openai': async (apiKey) => {
    const factory = await loadProvider<
      (options?: { apiKey?: string }) => (modelId: string) => LanguageModel
    >('@ai-sdk/openai', 'createOpenAI')
    return factory({ apiKey })
  },
  '@ai-sdk/anthropic': async (apiKey) => {
    const factory = await loadProvider<
      (options?: { apiKey?: string }) => (modelId: string) => LanguageModel
    >('@ai-sdk/anthropic', 'createAnthropic')
    return factory({ apiKey })
  },
  '@ai-sdk/google': async (apiKey) => {
    const factory = await loadProvider<
      (options?: { apiKey?: string }) => (modelId: string) => LanguageModel
    >('@ai-sdk/google', 'createGoogleGenerativeAI')
    return factory({ apiKey })
  },
  '@ai-sdk/mistral': async (apiKey) => {
    const factory = await loadProvider<
      (options?: { apiKey?: string }) => (modelId: string) => LanguageModel
    >('@ai-sdk/mistral', 'createMistral')
    return factory({ apiKey })
  },
  '@ai-sdk/perplexity': async (apiKey) => {
    const factory = await loadProvider<
      (options?: { apiKey?: string }) => (modelId: string) => LanguageModel
    >('@ai-sdk/perplexity', 'createPerplexity')
    return factory({ apiKey })
  },
  '@ai-sdk/xai': async (apiKey) => {
    const factory = await loadProvider<
      (options?: { apiKey?: string }) => (modelId: string) => LanguageModel
    >('@ai-sdk/xai', 'createXai')
    return factory({ apiKey })
  },
  '@ai-sdk/deepseek': async (apiKey) => {
    const factory = await loadProvider<
      (options?: { apiKey?: string }) => (modelId: string) => LanguageModel
    >('@ai-sdk/deepseek', 'createDeepSeek')
    return factory({ apiKey })
  },
  '@ai-sdk/openai-compatible': async (apiKey, provider) => {
    if (!provider?.api) {
      throw new UnsupportedProviderError(
        `Provider '${provider?.id}' is missing api baseURL`,
      )
    }

    const factory = await loadProvider<
      (options: {
        name: string
        baseURL: string
        apiKey?: string
      }) => (modelId: string) => LanguageModel
    >('@ai-sdk/openai-compatible', 'createOpenAICompatible')

    return factory({
      name: provider.id,
      baseURL: provider.api,
      apiKey,
    })
  },
}

/** Creates a language model instance from provider metadata. */
export async function createLanguageModel(
  provider: ModelsDevProvider,
  modelName: string,
  apiKey?: string,
): Promise<LanguageModel> {
  const npm = provider.npm ?? provider.id
  const factory =
    PROVIDER_FACTORIES[npm] ??
    (provider.id === 'openrouter'
      ? PROVIDER_FACTORIES['@ai-sdk/openai-compatible']
      : undefined)

  if (!factory) {
    throw new UnsupportedProviderError(
      `Provider '${provider.id}' is not supported`,
    )
  }

  if (provider.env?.length && !apiKey) {
    throw new ProviderAuthError(`Missing API key for provider '${provider.id}'`)
  }

  const providerFactory = await factory(apiKey, provider)
  return providerFactory(modelName)
}
