import { createAnthropic } from '@ai-sdk/anthropic'
import { createAzure } from '@ai-sdk/azure'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'

import { Providers } from '../../constants'

export type Config = {
  [key: string]: any
  provider?: string
  model?: string
  azure?: { resourceName: string }
}

export type PartialConfig = Omit<Config, 'provider'>

const GROQ_API_URL = 'https://api.groq.com/openai/v1'

export function createProvider({
  provider,
  apiKey,
  config,
}: {
  provider: Providers
  apiKey: string
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
    default:
      throw new Error(`Provider ${provider} not supported`)
  }
}

export function validateConfig(config: Record<string, unknown>): Config {
  const configSchema = z
    .object({
      model: z.string().optional(), // TODO: make it not optional if we ever remove the default provider
      provider: z.string().optional(), // TODO: make it not optional if we ever remove the default provider
      google: z
        .object({
          structuredOutputs: z.boolean().optional(),
          cachedContent: z.string().optional(),
          safetySettings: z
            .array(
              z
                .object({
                  category: z.string().optional(), // TODO: can be an enum
                  threshold: z.string().optional(), // TODO: can be an enum
                })
                .optional(),
            )
            .optional(),
        })
        .optional(),
      azure: z
        .object({
          resourceName: z.string(),
        })
        .optional(),
    })
    .catchall(z.unknown())

  return configSchema.parse(config)
}
