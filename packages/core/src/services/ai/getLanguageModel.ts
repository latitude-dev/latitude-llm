import { omit } from 'lodash-es'
import { Providers } from '@latitude-data/constants'
import { LanguageModel } from 'ai'
import { VercelConfigWithProviderRules } from './providers/rules'
import { LlmProvider } from './helpers'
import { OpenAIProvider } from '@ai-sdk/openai'
import { ProviderApiKey } from '../../browser'
import { ProviderConfiguration } from '../../schema'

function buildGenericLanguageModel({
  model,
  config,
  llmProvider,
}: {
  model: string
  config: VercelConfigWithProviderRules
  llmProvider: LlmProvider
}) {
  // @ts-expect-error - Some provider adapters don't accept a second argument
  // Perplexity is the one that we use that does not admit a second settings arg
  return llmProvider(model, {
    cacheControl: config.cacheControl ?? false,
    // providerOptions are passed to streamText
    ...omit(config, ['providerOptions']),
  })
}

export function getLanguageModel({
  model,
  config,
  provider,
  llmProvider,
  customLanguageModel,
}: {
  model: string
  config: VercelConfigWithProviderRules
  provider: ProviderApiKey
  llmProvider: LlmProvider
  customLanguageModel?: LanguageModel
}): LanguageModel {
  if (customLanguageModel) return customLanguageModel

  if (provider.provider !== Providers.OpenAI) {
    return buildGenericLanguageModel({ model, config, llmProvider })
  }

  const openAiProvider = llmProvider as OpenAIProvider
  const configuration =
    provider.configuration as ProviderConfiguration<Providers.OpenAI>
  const usingOpenAIResponses = configuration?.endpoint === 'responses'

  if (usingOpenAIResponses) return openAiProvider.responses(model)

  return buildGenericLanguageModel({ model, config, llmProvider })
}
