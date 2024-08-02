import { createAnthropic } from '@ai-sdk/anthropic'
import { createAzure } from '@ai-sdk/azure'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'
import { OpenAICompletionModelId } from '@ai-sdk/openai/internal'
import { Message } from '@latitude-data/compiler'
import { Providers } from '$core/browser'
import {
  CallWarning,
  CompletionTokenUsage,
  CoreMessage,
  FinishReason,
  streamText,
} from 'ai'

type FinishCallbackEvent = {
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

type FinishCallback = (event: FinishCallbackEvent) => void

function createProvider({
  provider,
  apiKey,
}: {
  provider: Providers
  apiKey: string
}) {
  switch (provider) {
    case Providers.OpenAI:
      return createOpenAI({
        apiKey,
        compatibility: 'strict', // needed for OpenAI to return token usage
      })
    case Providers.Groq:
      return createOpenAI({
        apiKey,
        compatibility: 'compatible',
        baseURL: 'https://api.groq.com/openai/v1',
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
        // TODO: replace with real resource name that users can write in the
        // document configuration
        resourceName: 'fake-resource-name',
      })
    default:
      throw new Error(`Provider ${provider} not supported`)
  }
}

export async function ai(
  {
    prompt,
    messages,
    apiKey,
    model,
    provider,
  }: {
    prompt?: string
    messages: Message[]
    apiKey: string
    model: OpenAICompletionModelId
    provider: Providers
  },
  {
    onFinish,
  }: {
    onFinish?: FinishCallback
  } = {},
) {
  const m = createProvider({ provider, apiKey })(model)

  return await streamText({
    model: m,
    prompt,
    messages: messages as CoreMessage[],
    onFinish,
  })
}
