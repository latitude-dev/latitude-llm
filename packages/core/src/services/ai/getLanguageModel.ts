import { OpenAIProvider } from '@ai-sdk/openai'
import { Providers } from '@latitude-data/constants'
import { ResolvedToolsDict } from '@latitude-data/constants/tools'
import { LanguageModel, wrapLanguageModel } from 'ai'
import { omit } from 'lodash-es'
import { ProviderConfiguration } from '../../schema/models/providerApiKeys'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { TelemetryContext } from '../../telemetry'
import { LlmProvider } from './helpers'
import { VercelConfigWithProviderRules } from './providers/rules/all'
import { createTelemetryMiddleware } from './telemetryMiddleware'

// FIXME: Is this doing anything? There are no options available here.
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
  context,
  resolvedTools,
}: {
  model: string
  config: VercelConfigWithProviderRules
  provider: ProviderApiKey
  llmProvider: LlmProvider
  customLanguageModel?: LanguageModel
  context: TelemetryContext
  resolvedTools?: ResolvedToolsDict
}): LanguageModel {
  if (customLanguageModel) {
    return wrapCompletionTelemetry({
      languageModel: customLanguageModel,
      provider,
      model,
      context,
      resolvedTools,
    })
  }

  if (![Providers.OpenAI, Providers.Custom].includes(provider.provider)) {
    const baseModel = buildGenericLanguageModel({ model, config, llmProvider })
    return wrapCompletionTelemetry({
      languageModel: baseModel,
      provider,
      model,
      context,
      resolvedTools,
    })
  }

  const configuration =
    provider.configuration as ProviderConfiguration<Providers.OpenAI>

  const isLegacyProvider = !configuration || !('endpoint' in configuration)
  const usingChatCompletions =
    isLegacyProvider || configuration.endpoint === 'chat_completions'

  if (usingChatCompletions) {
    llmProvider = (llmProvider as OpenAIProvider).chat as OpenAIProvider
  }

  // Default for text completions in OpenAI is `/responses` endpoint since
  // vercel SDK v5:
  // https://github.com/vercel/ai/pull/6833
  const baseModel = buildGenericLanguageModel({ model, config, llmProvider })
  return wrapCompletionTelemetry({
    languageModel: baseModel,
    provider,
    model,
    context,
    resolvedTools,
  })
}

function wrapCompletionTelemetry({
  languageModel,
  provider,
  model,
  context,
  resolvedTools,
}: {
  languageModel: LanguageModel
  provider: ProviderApiKey
  model: string
  context: TelemetryContext
  resolvedTools?: ResolvedToolsDict
}): LanguageModel {
  // wrapLanguageModel expects a LanguageModelV2 object, not a string model identifier.
  // Since buildGenericLanguageModel always returns a LanguageModelV2 object, we can safely cast.
  if (typeof languageModel === 'string') {
    return languageModel
  }

  return wrapLanguageModel({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: languageModel as any,
    middleware: createTelemetryMiddleware({
      context,
      providerName: provider.provider,
      model,
      resolvedTools,
    }),
  })
}
