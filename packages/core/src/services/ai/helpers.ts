import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { type AnthropicProvider, createAnthropic } from '@ai-sdk/anthropic'
import { createAzure } from '@ai-sdk/azure'
import { createDeepSeek, DeepSeekProvider } from '@ai-sdk/deepseek'
import {
  createGoogleGenerativeAI,
  GoogleGenerativeAIProvider,
} from '@ai-sdk/google'
import {
  createVertexAnthropic,
  GoogleVertexAnthropicProvider,
} from '@ai-sdk/google-vertex/anthropic'
import { createVertex, GoogleVertexProvider } from '@ai-sdk/google-vertex'
import { createMistral, MistralProvider } from '@ai-sdk/mistral'
import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai'
import { createPerplexity, PerplexityProvider } from '@ai-sdk/perplexity'
import { createXai, XaiProvider } from '@ai-sdk/xai'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'

import { Providers } from '@latitude-data/constants'
import { Result, TypedResult } from '../../lib/Result'

import { PartialPromptConfig } from '@latitude-data/constants'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { instrumentedFetch } from './fetch'
import {
  AmazonBedrockConfiguration,
  amazonBedrockConfigurationSchema,
} from './providers/helpers/amazonBedrock'
import { vertexConfigurationSchema } from './providers/helpers/vertex'

export { type PartialPromptConfig as PartialConfig } from '@latitude-data/constants'

const GROQ_API_URL = 'https://api.groq.com/openai/v1'

function createAmazonBedrockProvider(
  config: AmazonBedrockConfiguration,
  name: string,
) {
  const result = amazonBedrockConfigurationSchema.safeParse(config)

  if (!result.success) {
    return Result.error(
      new ChainError({
        code: RunErrorCodes.AIProviderConfigError,
        message: `Provider '${name}' is not properly configured. Details: ${result.error.message}`,
      }),
    )
  }

  return Result.ok(
    createAmazonBedrock({
      fetch: instrumentedFetch(),
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken,
    }),
  )
}

function validateVertexConfig({
  name,
  maybeConfig,
}: {
  name: string
  maybeConfig: unknown
}) {
  const result = vertexConfigurationSchema.safeParse(maybeConfig)
  if (result.success) {
    const config = result.data
    const privateKey = config.googleCredentials.privateKey.replace(/\\n/g, '\n')
    return Result.ok({
      ...config,
      googleAuthOptions: {
        credentials: {
          client_email: config.googleCredentials.clientEmail,
          private_key: privateKey,
        },
      },
    })
  }

  return Result.error(
    new ChainError({
      code: RunErrorCodes.AIProviderConfigError,
      message: `Provider '${name}' is not properly configured with all the Vertex required fields`,
    }),
  )
}

export type LlmProvider =
  | OpenAIProvider
  | AnthropicProvider
  | XaiProvider
  | MistralProvider
  | GoogleGenerativeAIProvider
  | GoogleVertexProvider
  | GoogleVertexAnthropicProvider
  | DeepSeekProvider
  | PerplexityProvider

export function createProvider({
  provider,
  apiKey,
  url,
  config,
}: {
  provider: ProviderApiKey
  apiKey: string
  url?: string
  config?: {
    model: string
    azure?: PartialPromptConfig['azure']
  }
}): TypedResult<LlmProvider, ChainError<RunErrorCodes.AIProviderConfigError>> {
  const type = provider.provider
  switch (type) {
    case Providers.OpenAI:
      return Result.ok(
        createOpenAI({
          fetch: instrumentedFetch(),
          apiKey,
        }),
      )
    case Providers.Groq:
      return Result.ok(
        createOpenAI({
          fetch: instrumentedFetch(),
          apiKey,
          baseURL: GROQ_API_URL,
        }),
      )
    case Providers.Anthropic:
      return Result.ok(
        createAnthropic({
          fetch: instrumentedFetch(),
          apiKey,
        }),
      )
    case Providers.Mistral:
      return Result.ok(
        createMistral({
          fetch: instrumentedFetch(),
          apiKey,
        }),
      )
    case Providers.Azure:
      return Result.ok(
        createAzure({
          fetch: instrumentedFetch(),
          apiKey,
          ...(config?.azure ?? {}),
        }),
      )
    case Providers.Google: {
      return Result.ok(
        createGoogleGenerativeAI({
          fetch: instrumentedFetch(),
          apiKey,
        }),
      )
    }
    case Providers.GoogleVertex: {
      const result = validateVertexConfig({
        name: provider.name,
        maybeConfig: provider.configuration,
      })
      if (result.error) return result
      const vertexConfig = result.value

      return Result.ok(
        createVertex({
          fetch: instrumentedFetch(),
          ...vertexConfig,
        }),
      )
    }

    case Providers.AnthropicVertex: {
      const result = validateVertexConfig({
        name: provider.name,
        maybeConfig: provider.configuration,
      })
      if (result.error) return result
      const vertexConfig = result.value

      return Result.ok(
        createVertexAnthropic({
          fetch: instrumentedFetch(),
          ...vertexConfig,
        }),
      )
    }
    case Providers.XAI:
      return Result.ok(
        createXai({
          fetch: instrumentedFetch(),
          apiKey,
        }),
      )
    case Providers.DeepSeek:
      return Result.ok(
        createDeepSeek({
          fetch: instrumentedFetch(),
          apiKey,
        }),
      )
    case Providers.Perplexity:
      return Result.ok(
        createPerplexity({
          fetch: instrumentedFetch(),
          apiKey,
        }),
      )
    case Providers.Custom:
      return Result.ok(
        createOpenAI({
          fetch: instrumentedFetch(),
          apiKey,
          baseURL: url,
        }),
      )
    case Providers.AmazonBedrock:
      return createAmazonBedrockProvider(
        provider.configuration as AmazonBedrockConfiguration,
        provider.name,
      )
    default:
      return Result.error(
        new ChainError({
          code: RunErrorCodes.AIProviderConfigError,
          message: `Provider ${provider} not supported`,
        }),
      )
  }
}
