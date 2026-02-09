import type {
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider'
import { describe, expect, it, vi } from 'vitest'

import {
  CapturedStreamResult,
  createStreamConsumer,
  extractGenerateResultContent,
} from './streamConsumer'

type StreamChunk = {
  type: string
  id?: string
  delta?: string
  mediaType?: string
  data?: string
  toolCallId?: string
  toolName?: string
  input?: string
  result?: unknown
  finishReason?: LanguageModelV2FinishReason
  usage?: Partial<LanguageModelV2Usage>
}

function chunk(c: StreamChunk): LanguageModelV2StreamPart {
  return c as unknown as LanguageModelV2StreamPart
}

function chunks(...cs: StreamChunk[]): LanguageModelV2StreamPart[] {
  return cs.map(chunk)
}

async function consumeTransformStream(
  streamChunks: LanguageModelV2StreamPart[],
  onConsumed: (result: CapturedStreamResult) => void,
): Promise<LanguageModelV2StreamPart[]> {
  const consumer = createStreamConsumer(onConsumed)

  const readable = new ReadableStream<LanguageModelV2StreamPart>({
    start(controller) {
      streamChunks.forEach((c) => controller.enqueue(c))
      controller.close()
    },
  })

  const passedThrough: LanguageModelV2StreamPart[] = []
  const writable = new WritableStream<LanguageModelV2StreamPart>({
    write(c) {
      passedThrough.push(c)
    },
  })

  await readable.pipeThrough(consumer).pipeTo(writable)

  return passedThrough
}

describe('createStreamConsumer', () => {
  describe('pass-through behavior', () => {
    it('passes through all chunks unchanged', async () => {
      const testChunks = chunks(
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '2', delta: 'Hello' },
        { type: 'text-delta', id: '3', delta: ' world' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        },
      )

      const onConsumed = vi.fn()
      const passedThrough = await consumeTransformStream(testChunks, onConsumed)

      expect(passedThrough).toEqual(testChunks)
    })

    it('passes through reasoning chunks unchanged', async () => {
      const testChunks = chunks(
        { type: 'reasoning-start', id: '1' },
        { type: 'reasoning-delta', id: '2', delta: 'Let me think' },
        { type: 'text-start', id: '3' },
        { type: 'text-delta', id: '4', delta: 'Answer' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        },
      )

      const onConsumed = vi.fn()
      const passedThrough = await consumeTransformStream(testChunks, onConsumed)

      expect(passedThrough).toEqual(testChunks)
    })
  })

  describe('text accumulation', () => {
    it('accumulates text from text-start and text-delta chunks', async () => {
      const testChunks = chunks(
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '2', delta: 'Hello' },
        { type: 'text-delta', id: '3', delta: ' world' },
        { type: 'text-delta', id: '4', delta: '!' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        },
      )

      const onConsumed = vi.fn()
      await consumeTransformStream(testChunks, onConsumed)

      expect(onConsumed).toHaveBeenCalledTimes(1)
      const result = onConsumed.mock.calls[0]![0] as CapturedStreamResult
      expect(result.output).toHaveLength(1)
      expect(result.output[0]).toEqual({
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello world!' }],
      })
    })

    it('handles empty text', async () => {
      const testChunks = chunks(
        { type: 'text-start', id: '1' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
        },
      )

      const onConsumed = vi.fn()
      await consumeTransformStream(testChunks, onConsumed)

      const result = onConsumed.mock.calls[0]![0] as CapturedStreamResult
      expect(result.output).toHaveLength(0)
    })
  })

  describe('reasoning accumulation', () => {
    it('accumulates reasoning from reasoning-start and reasoning-delta chunks', async () => {
      const testChunks = chunks(
        { type: 'reasoning-start', id: '1' },
        { type: 'reasoning-delta', id: '2', delta: 'Step 1: ' },
        { type: 'reasoning-delta', id: '3', delta: 'analyze the problem' },
        { type: 'text-start', id: '4' },
        { type: 'text-delta', id: '5', delta: 'The answer is 42' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: {
            inputTokens: 20,
            outputTokens: 15,
            totalTokens: 35,
            reasoningTokens: 10,
          },
        },
      )

      const onConsumed = vi.fn()
      await consumeTransformStream(testChunks, onConsumed)

      const result = onConsumed.mock.calls[0]![0] as CapturedStreamResult
      expect(result.output[0]).toEqual({
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Step 1: analyze the problem' },
          { type: 'text', text: 'The answer is 42' },
        ],
      })
    })

    it('handles only reasoning without text', async () => {
      const testChunks = chunks(
        { type: 'reasoning-start', id: '1' },
        { type: 'reasoning-delta', id: '2', delta: 'Thinking...' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        },
      )

      const onConsumed = vi.fn()
      await consumeTransformStream(testChunks, onConsumed)

      const result = onConsumed.mock.calls[0]![0] as CapturedStreamResult
      expect(result.output[0]).toEqual({
        role: 'assistant',
        content: [{ type: 'reasoning', text: 'Thinking...' }],
      })
    })
  })

  describe('file handling', () => {
    it('captures file chunks', async () => {
      const testChunks = chunks(
        {
          type: 'file',
          mediaType: 'image/png',
          data: 'base64encodeddata',
        },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        },
      )

      const onConsumed = vi.fn()
      await consumeTransformStream(testChunks, onConsumed)

      const result = onConsumed.mock.calls[0]![0] as CapturedStreamResult
      expect(result.output[0]!.content).toContainEqual({
        type: 'image',
        image: 'base64encodeddata',
      })
    })

    it('captures multiple files', async () => {
      const testChunks = chunks(
        { type: 'file', mediaType: 'image/png', data: 'image1' },
        { type: 'file', mediaType: 'image/jpeg', data: 'image2' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        },
      )

      const onConsumed = vi.fn()
      await consumeTransformStream(testChunks, onConsumed)

      const result = onConsumed.mock.calls[0]![0] as CapturedStreamResult
      expect(result.output[0]!.content).toHaveLength(2)
    })
  })

  describe('tool call handling', () => {
    it('captures tool-call chunks', async () => {
      const testChunks = chunks(
        {
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'get_weather',
          input: '{"location":"London"}',
        },
        {
          type: 'finish',
          finishReason: 'tool-calls',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        },
      )

      const onConsumed = vi.fn()
      await consumeTransformStream(testChunks, onConsumed)

      const result = onConsumed.mock.calls[0]![0] as CapturedStreamResult
      expect(result.output[0]!.content).toContainEqual({
        type: 'tool-call',
        toolCallId: 'call-123',
        toolName: 'get_weather',
        toolArguments: { location: 'London' },
        args: { location: 'London' },
      })
      expect(result.finishReason).toBe('tool-calls')
    })

    it('captures multiple tool calls', async () => {
      const testChunks = chunks(
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool_a',
          input: '{}',
        },
        {
          type: 'tool-call',
          toolCallId: 'call-2',
          toolName: 'tool_b',
          input: '{}',
        },
        {
          type: 'finish',
          finishReason: 'tool-calls',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        },
      )

      const onConsumed = vi.fn()
      await consumeTransformStream(testChunks, onConsumed)

      const result = onConsumed.mock.calls[0]![0] as CapturedStreamResult
      const toolCalls = result.output[0]!.content.filter(
        (c: { type: string }) => c.type === 'tool-call',
      )
      expect(toolCalls).toHaveLength(2)
    })
  })

  describe('tool result handling', () => {
    it('captures tool-result chunks', async () => {
      const testChunks = chunks(
        {
          type: 'tool-result',
          toolCallId: 'call-123',
          toolName: 'get_weather',
          result: { temperature: 20 },
        },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        },
      )

      const onConsumed = vi.fn()
      await consumeTransformStream(testChunks, onConsumed)

      const result = onConsumed.mock.calls[0]![0] as CapturedStreamResult
      expect(result.output[0]!.content).toContainEqual({
        type: 'tool-result',
        toolCallId: 'call-123',
        toolName: 'get_weather',
        result: { temperature: 20 },
        isError: false,
      })
    })
  })

  describe('finish and usage handling', () => {
    it('captures finish reason', async () => {
      const finishReasons: LanguageModelV2FinishReason[] = [
        'stop',
        'length',
        'tool-calls',
        'content-filter',
        'error',
        'other',
      ]

      for (const finishReason of finishReasons) {
        const testChunks = chunks(
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '2', delta: 'test' },
          {
            type: 'finish',
            finishReason,
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          },
        )

        const onConsumed = vi.fn()
        await consumeTransformStream(testChunks, onConsumed)

        const result = onConsumed.mock.calls[0]![0] as CapturedStreamResult
        expect(result.finishReason).toBe(finishReason)
      }
    })

    it('captures token usage', async () => {
      const usage = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cachedInputTokens: 25,
        reasoningTokens: 30,
      }

      const testChunks = chunks(
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '2', delta: 'test' },
        { type: 'finish', finishReason: 'stop', usage },
      )

      const onConsumed = vi.fn()
      await consumeTransformStream(testChunks, onConsumed)

      const result = onConsumed.mock.calls[0]![0] as CapturedStreamResult
      expect(result.tokens).toEqual({
        prompt: 100,
        completion: 50,
        cached: 25,
        reasoning: 30,
      })
    })

    it('handles missing usage values', async () => {
      const testChunks = chunks(
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '2', delta: 'test' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        },
      )

      const onConsumed = vi.fn()
      await consumeTransformStream(testChunks, onConsumed)

      const result = onConsumed.mock.calls[0]![0] as CapturedStreamResult
      expect(result.tokens).toEqual({
        prompt: 10,
        completion: 5,
        cached: undefined,
        reasoning: undefined,
      })
    })

    it('defaults to unknown finish reason when not provided', async () => {
      const testChunks = chunks(
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '2', delta: 'test' },
      )

      const onConsumed = vi.fn()
      await consumeTransformStream(testChunks, onConsumed)

      const result = onConsumed.mock.calls[0]![0] as CapturedStreamResult
      expect(result.finishReason).toBe('unknown')
    })
  })

  describe('mixed content', () => {
    it('handles stream with text, reasoning, and tool calls', async () => {
      const testChunks = chunks(
        { type: 'reasoning-start', id: '1' },
        { type: 'reasoning-delta', id: '2', delta: 'I need to call a tool' },
        { type: 'text-start', id: '3' },
        { type: 'text-delta', id: '4', delta: 'Let me check' },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'search',
          input: '{"query": "test"}',
        },
        {
          type: 'finish',
          finishReason: 'tool-calls',
          usage: {
            inputTokens: 50,
            outputTokens: 30,
            totalTokens: 80,
            reasoningTokens: 10,
          },
        },
      )

      const onConsumed = vi.fn()
      await consumeTransformStream(testChunks, onConsumed)

      const result = onConsumed.mock.calls[0]![0] as CapturedStreamResult
      expect(result.output[0]!.content).toHaveLength(3)
      expect(result.finishReason).toBe('tool-calls')
      expect(result.tokens.reasoning).toBe(10)
    })
  })

  describe('empty stream', () => {
    it('handles stream with only finish chunk', async () => {
      const testChunks = chunks({
        type: 'finish',
        finishReason: 'stop',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      })

      const onConsumed = vi.fn()
      await consumeTransformStream(testChunks, onConsumed)

      const result = onConsumed.mock.calls[0]![0] as CapturedStreamResult
      expect(result.output).toHaveLength(0)
      expect(result.finishReason).toBe('stop')
    })
  })
})

describe('extractGenerateResultContent', () => {
  type GenerateResult = Parameters<typeof extractGenerateResultContent>[0]

  function generateResult(
    partial: Partial<GenerateResult> & Pick<GenerateResult, 'content'>,
  ): GenerateResult {
    return {
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      warnings: [],
      ...partial,
    } as GenerateResult
  }

  it('extracts text content from generate result', () => {
    const result = generateResult({
      content: [{ type: 'text', text: 'Hello world' }],
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    })

    const extracted = extractGenerateResultContent(result)

    expect(extracted.output[0]).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello world' }],
    })
    expect(extracted.finishReason).toBe('stop')
    expect(extracted.tokens).toEqual({
      prompt: 10,
      completion: 5,
      cached: undefined,
      reasoning: undefined,
    })
  })

  it('extracts reasoning content from generate result', () => {
    const result = generateResult({
      content: [
        { type: 'reasoning', text: 'Let me think' },
        { type: 'text', text: 'The answer' },
      ],
      finishReason: 'stop',
      usage: {
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
        reasoningTokens: 5,
      },
    })

    const extracted = extractGenerateResultContent(result)

    expect(extracted.output[0]!.content).toContainEqual({
      type: 'reasoning',
      text: 'Let me think',
    })
    expect(extracted.tokens.reasoning).toBe(5)
  })

  it('extracts tool calls from generate result', () => {
    const result = generateResult({
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'get_weather',
          input: '{"location":"London"}',
        },
      ],
      finishReason: 'tool-calls',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    })

    const extracted = extractGenerateResultContent(result)

    expect(extracted.output[0]!.content).toContainEqual({
      type: 'tool-call',
      toolCallId: 'call-123',
      toolName: 'get_weather',
      toolArguments: { location: 'London' },
      args: { location: 'London' },
    })
    expect(extracted.finishReason).toBe('tool-calls')
  })

  it('handles cached tokens in usage', () => {
    const result = generateResult({
      content: [{ type: 'text', text: 'test' }],
      finishReason: 'stop',
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cachedInputTokens: 25,
        reasoningTokens: 10,
      },
    })

    const extracted = extractGenerateResultContent(result)

    expect(extracted.tokens).toEqual({
      prompt: 100,
      completion: 50,
      cached: 25,
      reasoning: 10,
    })
  })

  it('defaults to unknown finish reason when not provided', () => {
    const result = generateResult({
      content: [{ type: 'text', text: 'test' }],
      finishReason: undefined as unknown as LanguageModelV2FinishReason,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    })

    const extracted = extractGenerateResultContent(result)

    expect(extracted.finishReason).toBe('unknown')
  })
})
