/**
 * Stream consumer utilities for AI SDK streams.
 * Provides a TransformStream that captures all content from the stream
 * without consuming it, passing through all chunks unchanged.
 */

import type {
  LanguageModelV2,
  LanguageModelV2FilePart,
  LanguageModelV2FinishReason,
  LanguageModelV2ReasoningPart,
  LanguageModelV2StreamPart,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
  LanguageModelV2ToolResultPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider'
import { Message } from '@latitude-data/constants/messages'
import { Provider, Translator } from 'rosetta-ai'
import { captureException } from '../../utils/datadogCapture'

const translator = new Translator({
  filterEmptyMessages: true,
  providerMetadata: 'strip',
})

/**
 * Complete stream result captured from consuming the stream
 */
export type CapturedStreamResult = {
  output: Message[]
  finishReason: string
  tokens: {
    prompt?: number
    cached?: number
    reasoning?: number
    completion?: number
  }
}

/**
 * Callback invoked when the stream is fully consumed
 */
export type StreamConsumedCallback = (result: CapturedStreamResult) => void

/**
 * Creates a TransformStream that captures all content from an AI SDK stream
 * while passing through all chunks unchanged.
 *
 * Captures:
 * - text-delta: Accumulated into full text
 * - reasoning-delta: Accumulated into full reasoning text
 * - file: Complete files with mediaType and data
 * - tool-call: Complete tool calls with id, name, and args
 * - tool-result: Complete tool results with id, name, and result
 * - finish: finishReason and token usage (including cached and reasoning tokens)
 *
 * @param onConsumed - Callback invoked when the stream is fully consumed (in flush)
 * @returns TransformStream that can be piped through
 */
export function createStreamConsumer(
  onConsumed: StreamConsumedCallback,
): TransformStream<LanguageModelV2StreamPart, LanguageModelV2StreamPart> {
  let usage: LanguageModelV2Usage | undefined
  let finishReason: LanguageModelV2FinishReason | undefined

  let text: LanguageModelV2TextPart | undefined
  let reasoning: LanguageModelV2ReasoningPart | undefined
  const files: LanguageModelV2FilePart[] = []
  const toolCalls: LanguageModelV2ToolCallPart[] = []
  const toolResults: LanguageModelV2ToolResultPart[] = []

  return new TransformStream({
    transform(chunk, controller) {
      switch (chunk.type) {
        case 'text-start':
          text = { type: 'text', text: '' }
          break

        case 'text-delta':
          text!.text += chunk.delta
          break

        case 'reasoning-start':
          reasoning = { type: 'reasoning', text: '' }
          break

        case 'reasoning-delta':
          reasoning!.text += chunk.delta
          break

        case 'file':
          files.push(chunk)
          break

        case 'tool-call':
          toolCalls.push(chunk)
          break

        case 'tool-result':
          toolResults.push(chunk as any)
          break

        case 'finish':
          usage = chunk.usage
          finishReason = chunk.finishReason
          break
      }

      controller.enqueue(chunk)
    },

    flush() {
      const content = []
      if (reasoning) content.push(reasoning)
      if (text) content.push(text)
      if (files.length > 0) content.push(...files)
      if (toolCalls.length > 0) content.push(...toolCalls)
      if (toolResults.length > 0) content.push(...toolResults)

      const translating = translator.safeTranslate(
        [{ role: 'assistant', content }],
        {
          from: Provider.VercelAI,
          to: Provider.Promptl,
          direction: 'output',
        },
      )
      if (translating.error) captureException(translating.error)
      const translated = (translating.messages ?? []) as Message[]

      onConsumed({
        output: translated,
        finishReason: finishReason ?? 'unknown',
        tokens: {
          prompt: usage?.inputTokens,
          cached: usage?.cachedInputTokens,
          reasoning: usage?.reasoningTokens,
          completion: usage?.outputTokens,
        },
      })
    },
  })
}

/**
 * Extracts content from a non-streaming (generate) result.
 * Handles text, reasoning, and tool calls from the result content array.
 */
export function extractGenerateResultContent(
  result: Awaited<ReturnType<LanguageModelV2['doGenerate']>>,
): CapturedStreamResult {
  const translating = translator.safeTranslate(
    [{ role: 'assistant', content: result.content }],
    {
      from: Provider.VercelAI,
      to: Provider.Promptl,
      direction: 'output',
    },
  )
  if (translating.error) captureException(translating.error)
  const translated = (translating.messages ?? []) as Message[]

  return {
    output: translated,
    finishReason: result.finishReason ?? 'unknown',
    tokens: {
      prompt: result.usage?.inputTokens,
      completion: result.usage?.outputTokens,
      cached: result.usage?.cachedInputTokens,
      reasoning: result.usage?.reasoningTokens,
    },
  }
}
