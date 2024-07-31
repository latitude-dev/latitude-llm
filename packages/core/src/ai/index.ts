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

function getProvider(provider: Providers) {
  switch (provider) {
    case Providers.OpenAI:
      return createOpenAI
    default:
      throw new Error(`Provider ${provider} not supported`)
  }
}

export default async function ai(
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
  const p = getProvider(provider)({ apiKey })
  const m = p(model)

  return await streamText({
    model: m,
    prompt,
    messages: messages as CoreMessage[],
    onFinish,
  })
}
