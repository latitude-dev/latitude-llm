import { createAnthropic } from '@ai-sdk/anthropic'
import { createAzure } from '@ai-sdk/azure'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'

import { Providers } from '../../constants'

export type Config = {
  [key: string]: any
  provider: string
  model: string
  url?: string
  azure?: { resourceName: string }
}

export type PartialConfig = Omit<Config, 'provider'>

const GROQ_API_URL = 'https://api.groq.com/openai/v1'

export function createProvider({
  provider,
  apiKey,
  url,
  config,
}: {
  provider: Providers
  apiKey: string
  url?: string
  config?: PartialConfig
}) {
  switch (provider) {
    case Providers.OpenAI:
      return createOpenAI({
        apiKey,
        // Needed for OpenAI to return token usage
        compatibility: 'strict',
      })
    case Providers.Groq:
      return createOpenAI({
        apiKey,
        compatibility: 'compatible',
        baseURL: GROQ_API_URL,
      })
    case Providers.Anthropic:
      return createAnthropic({
        apiKey,
      })
    case Providers.Mistral:
      return createMistral({
        apiKey,
      })
    case Providers.Azure:
      return createAzure({
        apiKey,
        ...(config?.azure ?? {}),
      })
    case Providers.Google:
      return createGoogleGenerativeAI({
        apiKey,
        ...(config?.google ?? {}),
      })
    case Providers.Custom:
      return createOpenAI({
        apiKey: apiKey,
        compatibility: 'compatible',
        baseURL: url,
      })
    default:
      throw new Error(`Provider ${provider} not supported`)
  }
}
