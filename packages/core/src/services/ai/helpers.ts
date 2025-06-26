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
} from '@ai-sdk/google-vertex/anthropic/edge'
import { createVertex, GoogleVertexProvider } from '@ai-sdk/google-vertex/edge'
import { createMistral, MistralProvider } from '@ai-sdk/mistral'
import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai'
import { createPerplexity, PerplexityProvider } from '@ai-sdk/perplexity'
import { createXai, XaiProvider } from '@ai-sdk/xai'
import { type Message, MessageRole } from '@latitude-data/compiler'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { TelemetryContext } from '../../telemetry'

import { Providers } from '../../constants'
import { Result, TypedResult } from '../../lib/Result'

import { PartialPromptConfig } from '@latitude-data/constants'
import { ProviderApiKey } from '../../browser'
import type { ModelCost } from './estimateCost'
import { instrumentedFetch } from './fetch'
import {
  AmazonBedrockConfiguration,
  amazonBedrockConfigurationSchema,
} from './providers/helpers/amazonBedrock'
import { vertexConfigurationSchema } from './providers/helpers/vertex'

export { type PartialPromptConfig as PartialConfig } from '@latitude-data/constants'

const GROQ_API_URL = 'https://api.groq.com/openai/v1'

function isFirstMessageOfUserType(messages: Message[]) {
  const message = messages.find((m) => m.role === MessageRole.user)

  if (message) return Result.nil()

  return Result.error(
    new ChainError({
      code: RunErrorCodes.AIProviderConfigError,
      message: 'Google provider requires at least one user message',
    }),
  )
}

function createAmazonBedrockProvider(
  context: TelemetryContext,
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
      fetch: instrumentedFetch({ context }),
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
      googleCredentials: {
        ...config.googleCredentials,
        privateKey,
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
  context,
  provider,
  messages,
  apiKey,
  url,
  config,
}: {
  context: TelemetryContext
  provider: ProviderApiKey
  messages: Message[]
  apiKey: string
  url?: string
  config?: PartialPromptConfig
}): TypedResult<LlmProvider, ChainError<RunErrorCodes.AIProviderConfigError>> {
  const type = provider.provider
  switch (type) {
    case Providers.OpenAI:
      return Result.ok(
        createOpenAI({
          fetch: instrumentedFetch({ context }),
          apiKey,
          // Needed for OpenAI to return token usage
          compatibility: 'strict',
        }),
      )
    case Providers.Groq:
      return Result.ok(
        createOpenAI({
          fetch: instrumentedFetch({ context }),
          apiKey,
          compatibility: 'compatible',
          baseURL: GROQ_API_URL,
        }),
      )
    case Providers.Anthropic:
      return Result.ok(
        createAnthropic({
          fetch: instrumentedFetch({ context }),
          apiKey,
        }),
      )
    case Providers.Mistral:
      return Result.ok(
        createMistral({
          fetch: instrumentedFetch({ context }),
          apiKey,
        }),
      )
    case Providers.Azure:
      return Result.ok(
        createAzure({
          fetch: instrumentedFetch({ context }),
          apiKey,
          ...(config?.azure ?? {}),
        }),
      )
    case Providers.Google: {
      const firstMessageResult = isFirstMessageOfUserType(messages)
      if (firstMessageResult.error) return firstMessageResult

      return Result.ok(
        createGoogleGenerativeAI({
          fetch: instrumentedFetch({ context }),
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
      const config = result.value

      return Result.ok(
        createVertex({
          fetch: instrumentedFetch({ context }),
          ...config,
        }),
      )
    }

    case Providers.AnthropicVertex: {
      const result = validateVertexConfig({
        name: provider.name,
        maybeConfig: provider.configuration,
      })
      if (result.error) return result
      const config = result.value

      return Result.ok(
        createVertexAnthropic({
          fetch: instrumentedFetch({ context }),
          ...config,
        }),
      )
    }
    case Providers.XAI:
      return Result.ok(
        createXai({
          fetch: instrumentedFetch({ context }),
          apiKey,
        }),
      )
    case Providers.DeepSeek:
      return Result.ok(
        createDeepSeek({
          fetch: instrumentedFetch({ context }),
          apiKey,
        }),
      )
    case Providers.Perplexity:
      return Result.ok(
        createPerplexity({
          fetch: instrumentedFetch({ context }),
          apiKey,
        }),
      )
    case Providers.Custom:
      return Result.ok(
        createOpenAI({
          fetch: instrumentedFetch({ context }),
          apiKey,
          compatibility: 'compatible',
          baseURL: url,
        }),
      )
    case Providers.AmazonBedrock:
      return createAmazonBedrockProvider(
        context,
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

type ModelSpec = ModelCost & { hidden?: boolean }
type ModelSpecValue<N extends string> = ModelSpec & { name: N }
export const createModelSpec = <T extends Record<string, ModelSpec>>(
  models: T,
) => {
  const modelSpec = Object.fromEntries(
    Object.entries(models).map(([key, value]) => {
      return [
        key,
        {
          ...value,
          name: key as T & string,
        },
      ]
    }),
  ) as unknown as { [K in keyof T]: ModelSpecValue<K & string> }

  const modelKeys = Object.keys(modelSpec) as (keyof T)[]
  const uiModelListKeys = modelKeys.filter((m) => !modelSpec[m]!.hidden)
  const modelList = modelKeys.reduce(
    (acc, model) => {
      acc[model] = model
      return acc
    },
    {} as Record<keyof T, keyof T>,
  )

  // This is final list used in the UI
  // Hidden models are for example snapshots
  // that we have the price but we don't want to show them in the UI.
  const uiList = uiModelListKeys.reduce(
    (acc, model) => {
      acc[model] = model
      return acc
    },
    {} as Record<keyof T, keyof T>,
  )

  return { modelSpec, modelList, uiList }
}
