import { createAnthropic } from '@ai-sdk/anthropic'
import { createAzure } from '@ai-sdk/azure'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'
import { type Message, MessageRole } from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'

import { Providers } from '../../constants'
import { Result } from '../../lib'
import { ChainError } from '../../lib/streamManager/ChainErrors'

import { PartialConfig } from '@latitude-data/constants'
export {
  type Config,
  type PartialConfig,
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

export function createProvider({
  provider,
  messages,
  apiKey,
  url,
  config,
}: {
  provider: Providers
  messages: Message[]
  apiKey: string
  url?: string
  config?: PartialConfig
}) {
  switch (provider) {
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
    case Providers.Custom:
      return Result.ok(
        createOpenAI({
          apiKey: apiKey,
          compatibility: 'compatible',
          baseURL: url,
        }),
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
