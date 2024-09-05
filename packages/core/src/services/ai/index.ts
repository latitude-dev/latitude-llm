import { createAnthropic } from '@ai-sdk/anthropic'
import { createAzure } from '@ai-sdk/azure'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'
import { Message } from '@latitude-data/compiler'
import {
  CallWarning,
  CompletionTokenUsage,
  CoreMessage,
  FinishReason,
  streamText,
} from 'ai'
import { v4 } from 'uuid'
import { z } from 'zod'

import { LogSources, ProviderApiKey, Providers } from '../../browser'
import { publisher } from '../../events/publisher'
import { CreateProviderLogProps } from '../providerLogs/create'

export type FinishCallbackEvent = {
  finishReason: FinishReason
  usage: CompletionTokenUsage
  text: string
  toolCalls?:
    | {
        type: 'tool-call'
        toolCallId: string
        toolName: string
        args: any
      }[]
    | undefined
  toolResults?: never[] | undefined
  rawResponse?: {
    headers?: Record<string, string>
  }
  warnings?: CallWarning[]
}
export type FinishCallback = (event: FinishCallbackEvent) => void

export type Config = {
  [key: string]: any
  provider: string
  model: string
  azure?: { resourceName: string }
}

export type PartialConfig = Omit<Config, 'provider'>

const GROQ_API_URL = 'https://api.groq.com/openai/v1'

function createProvider({
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

export type AILog = Omit<CreateProviderLogProps, 'apiKeyId' | 'source'>
export async function ai(
  {
    provider: apiProvider,
    prompt,
    messages,
    config,
    documentLogUuid,
    source,
  }: {
    provider: ProviderApiKey
    config: PartialConfig
    messages: Message[]
    documentLogUuid?: string
    prompt?: string
    source: LogSources
  },
  {
    onFinish,
  }: {
    onFinish?: FinishCallback
  } = {},
) {
  const startTime = Date.now()
  const {
    provider,
    token: apiKey,
    id: providerId,
    provider: providerType,
  } = apiProvider
  const model = config.model
  const m = createProvider({ provider, apiKey, config })(model)

  const result = await streamText({
    model: m,
    prompt,
    messages: messages as CoreMessage[],
    onFinish: (event) => {
      publisher.publish({
        type: 'aiProviderCallCompleted',
        data: {
          uuid: v4(),
          source,
          generatedAt: new Date(),
          documentLogUuid,
          providerId,
          providerType,
          model,
          config,
          messages,
          responseText: event.text,
          toolCalls: event.toolCalls?.map((t) => ({
            id: t.toolCallId,
            name: t.toolName,
            arguments: t.args,
          })),
          usage: event.usage,
          duration: Date.now() - startTime,
        },
      })

      onFinish?.(event)
    },
  })

  return {
    fullStream: result.fullStream,
    text: result.text,
    usage: result.usage,
    toolCalls: result.toolCalls,
  }
}

export function validateConfig(config: Record<string, unknown>): Config {
  const configSchema = z
    .object({
      model: z.string(),
      provider: z.string(),
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

export { estimateCost } from './estimateCost'
