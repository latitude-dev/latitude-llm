import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createAzure } from '@ai-sdk/azure'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createVertex } from '@ai-sdk/google-vertex/edge'
import { createVertexAnthropic } from '@ai-sdk/google-vertex/anthropic/edge'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'
import { createXai } from '@ai-sdk/xai'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createPerplexity } from '@ai-sdk/perplexity'
import { type Message, MessageRole } from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'

import { Providers } from '../../constants'
import { Result } from '../../lib'
import { ChainError } from '../../lib/chainStreamManager/ChainErrors'

import { PartialPromptConfig } from '@latitude-data/constants'
import type { ModelCost } from './estimateCost'
import { ProviderApiKey } from '../../browser'
import { vertexConfigurationSchema } from './providers/helpers/vertex'
import {
  AmazonBedrockConfiguration,
  amazonBedrockConfigurationSchema,
} from './providers/helpers/amazonBedrock'
export {
  type PromptConfig as Config,
  type PartialPromptConfig as PartialConfig,
  googleConfig,
  azureConfig,
} from '@latitude-data/constants'

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

export function createProvider({
  provider,
  messages,
  apiKey,
  url,
  config,
}: {
  provider: ProviderApiKey
  messages: Message[]
  apiKey: string
  url?: string
  config?: PartialPromptConfig
}) {
  const type = provider.provider
  switch (type) {
    case Providers.OpenAI:
      return Result.ok(
        createOpenAI({
          apiKey,
          // Needed for OpenAI to return token usage
          compatibility: 'strict',
        }),
      )
    case Providers.Groq:
      return Result.ok(
        createOpenAI({
          apiKey,
          compatibility: 'compatible',
          baseURL: GROQ_API_URL,
        }),
      )
    case Providers.Anthropic:
      return Result.ok(
        createAnthropic({
          apiKey,
        }),
      )
    case Providers.Mistral:
      return Result.ok(
        createMistral({
          apiKey,
        }),
      )
    case Providers.Azure:
      return Result.ok(
        createAzure({
          apiKey,
          ...(config?.azure ?? {}),
        }),
      )
    case Providers.Google: {
      const firstMessageResult = isFirstMessageOfUserType(messages)
      if (firstMessageResult.error) return firstMessageResult

      return Result.ok(
        createGoogleGenerativeAI({
          apiKey,
          ...(config?.google ?? {}),
        }),
      )
    }
    case Providers.GoogleVertex: {
      const result = validateVertexConfig({
        name: provider.name,
        maybeConfig: provider.configuration,
      })

      return result.error ? result : Result.ok(createVertex(result.value))
    }

    case Providers.AnthropicVertex: {
      const result = validateVertexConfig({
        name: provider.name,
        maybeConfig: provider.configuration,
      })

      return result.error
        ? result
        : Result.ok(createVertexAnthropic(result.value))
    }
    case Providers.XAI:
      return Result.ok(
        createXai({
          apiKey: apiKey!,
        }),
      )
    case Providers.DeepSeek:
      return Result.ok(
        createDeepSeek({
          apiKey: apiKey!,
        }),
      )
    case Providers.Perplexity:
      return Result.ok(
        createPerplexity({
          apiKey: apiKey!,
        }),
      )
    case Providers.Custom:
      return Result.ok(
        createOpenAI({
          apiKey: apiKey,
          compatibility: 'compatible',
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
