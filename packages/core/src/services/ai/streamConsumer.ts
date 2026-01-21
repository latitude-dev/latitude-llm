/**
 * Stream consumer utilities for AI SDK streams.
 * Provides a TransformStream that captures all content from the stream
 * without consuming it, passing through all chunks unchanged.
 */

import type { LanguageModelV2StreamPart } from '@ai-sdk/provider'
import { Message, MessageContent, MessageRole, ToolCall } from '@latitude-data/constants/legacyCompiler'

/**
 * Represents a tool call captured from the stream
 */
export type CapturedToolCall = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: unknown
}

export type CapturedFile = {
  type: 'file'
  mediaType: string
  data: string | Uint8Array | ArrayBuffer
}

/**
 * Token usage information captured from the stream
 */
export type CapturedTokenUsage = {
  prompt?: number
  completion?: number
  cached?: number
  reasoning?: number
}

/**
 * Complete stream result captured from consuming the stream
 */
export type CapturedStreamResult = {
  text: string
  reasoning: string
  files: CapturedFile[]
  toolCalls: CapturedToolCall[]
  finishReason: string
  tokens: CapturedTokenUsage
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
 * - reasoning: Accumulated into full reasoning text
 * - tool-call: Complete tool calls with id, name, and args
 * - finish: finishReason and token usage (including cached and reasoning tokens)
 *
 * @param onConsumed - Callback invoked when the stream is fully consumed (in flush)
 * @returns TransformStream that can be piped through
 */
export function createStreamConsumer(
  onConsumed: StreamConsumedCallback,
): TransformStream<LanguageModelV2StreamPart, LanguageModelV2StreamPart> {
  let finishReason: string | undefined
  let promptTokens: number | undefined
  let completionTokens: number | undefined
  let cachedTokens: number | undefined
  let reasoningTokens: number | undefined

  const textParts: string[] = []
  const reasoningParts: string[] = []
  const files: CapturedFile[] = []
  const toolCalls: CapturedToolCall[] = []

  return new TransformStream({
    transform(chunk, controller) {
      switch (chunk.type) {
        case 'text-delta':
          textParts.push(chunk.delta)
          break

        case 'reasoning-delta':
          reasoningParts.push(chunk.delta)
          break

        case 'file':
          files.push({
            type: 'file',
            mediaType: chunk.mediaType,
            data: chunk.data,
          })
          break

        case 'tool-call':
          toolCalls.push({
            type: 'tool-call',
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            args: chunk.input,
          })
          break

        case 'finish':
          finishReason = chunk.finishReason
          promptTokens = chunk.usage?.inputTokens
          completionTokens = chunk.usage?.outputTokens
          cachedTokens = chunk.usage?.cachedInputTokens
          reasoningTokens = chunk.usage?.reasoningTokens
          break
      }

      controller.enqueue(chunk)
    },

    flush() {
      onConsumed({
        text: textParts.join(''),
        reasoning: reasoningParts.join(''),
        files,
        toolCalls,
        finishReason: finishReason ?? 'unknown',
        tokens: {
          prompt: promptTokens,
          completion: completionTokens,
          cached: cachedTokens,
          reasoning: reasoningTokens,
        },
      })
    },
  })
}

/**
 * Builds output messages array from captured stream result.
 * Formats the result into the message structure expected by telemetry.
 */
export function buildOutputMessages(
  result: CapturedStreamResult,
): Message[] {
  const content: MessageContent[] = []

  if (result.reasoning) {
    content.push({ type: 'reasoning', text: result.reasoning })
  }
  
  if (result.text) {
    content.push({ type: 'text', text: result.text })
  }

  for (const file of result.files) {

    if (file.mediaType.startsWith('image/')) {
      content.push({
        type: 'image',
        image: file.data,
      })
    } else {
      content.push({
        type: 'file',
        file: file.data,
        mimeType: file.mediaType,
      })
    }
  }

  for (const tc of result.toolCalls) {
    content.push({
      type: 'tool-call',
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      args: tc.args as Record<string, unknown>,
    })
  }

  const toolCalls: ToolCall[] = result.toolCalls.map((tc) => ({
    id: tc.toolCallId,
    name: tc.toolName,
    arguments: tc.args as Record<string, unknown>,
  }))

  return [{ role: MessageRole.assistant, content, toolCalls }]
}

/**
 * Extracts content from a non-streaming (generate) result.
 * Handles text, reasoning, and tool calls from the result content array.
 */
export function extractGenerateResultContent(result: {
  content: unknown
  finishReason: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
    cachedInputTokens?: number
    reasoningTokens?: number
  }
}): CapturedStreamResult {
  const textParts: string[] = []
  const reasoningParts: string[] = []
  const files: CapturedFile[] = []
  const toolCalls: CapturedToolCall[] = []

  if (Array.isArray(result.content)) {
    for (const part of result.content) {
      if (typeof part !== 'object' || part === null) continue

      const partType = (part as Record<string, unknown>).type

      switch (partType) {
        case 'text':
          if ('text' in part && typeof part.text === 'string') {
            textParts.push(part.text)
          }
          break

        case 'reasoning':
          if ('text' in part && typeof part.text === 'string') {
            reasoningParts.push(part.text)
          }
          break

        case 'file':
          files.push({
            type: 'file',
            mediaType: part.mediaType,
            data: part.data,
          })
          break

        case 'tool-call':
          if (
            'toolCallId' in part &&
            'toolName' in part &&
            typeof part.toolCallId === 'string' &&
            typeof part.toolName === 'string'
          ) {
            toolCalls.push({
              type: 'tool-call',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: 'args' in part ? part.args : undefined,
            })
          }
          break
      }
    }
  }

  return {
    text: textParts.join(''),
    reasoning: reasoningParts.join(''),
    files,
    toolCalls,
    finishReason: result.finishReason,
    tokens: {
      prompt: result.usage?.inputTokens,
      completion: result.usage?.outputTokens,
      cached: result.usage?.cachedInputTokens,
      reasoning: result.usage?.reasoningTokens,
    },
  }
}
