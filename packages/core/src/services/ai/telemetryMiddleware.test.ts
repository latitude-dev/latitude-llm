import { describe, expect, it, vi, beforeEach, type TaskContext } from 'vitest'
import { context as otelContext, ROOT_CONTEXT } from '@opentelemetry/api'
import { createTelemetryMiddleware } from './telemetryMiddleware'
import type { TelemetryContext } from '../../telemetry'
import type { LanguageModelMiddleware } from 'ai'

type TelemetryMocks = TaskContext & {
  mocks: {
    telemetry: {
      sdk: ReturnType<typeof vi.spyOn>
      exporter: { spans: unknown[] }
      processor: unknown
    }
  }
}

type WrapGenerateParams = Parameters<
  NonNullable<LanguageModelMiddleware['wrapGenerate']>
>[0]
type WrapStreamParams = Parameters<
  NonNullable<LanguageModelMiddleware['wrapStream']>
>[0]

describe('createTelemetryMiddleware', () => {
  const mockContext = ROOT_CONTEXT as TelemetryContext
  const providerName = 'openai'
  const model = 'gpt-4o'

  let mockSpanEnd: ReturnType<typeof vi.fn>
  let mockSpanFail: ReturnType<typeof vi.fn>
  let mockSpanContext: TelemetryContext
  let mockCompletion: ReturnType<typeof vi.fn>

  beforeEach((ctx: TelemetryMocks) => {
    mockSpanContext = ROOT_CONTEXT as TelemetryContext
    mockSpanEnd = vi.fn()
    mockSpanFail = vi.fn()

    const mockCompletionSpan = {
      context: mockSpanContext,
      end: mockSpanEnd,
      fail: mockSpanFail,
    }

    mockCompletion = vi.fn(() => mockCompletionSpan)

    const mockTelemetry = {
      span: {
        completion: mockCompletion,
      },
    }

    ctx.mocks.telemetry.sdk.mockReturnValue(mockTelemetry)
  })

  describe('wrapGenerate', () => {
    it('creates a completion span and calls doGenerate', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const mockResult = {
        content: [{ type: 'text', text: 'Hello, world!' }],
        usage: { inputTokens: 10, outputTokens: 5 },
        finishReason: 'stop',
      }
      const doGenerate = vi.fn().mockResolvedValue(mockResult)

      const params = {
        prompt: [{ role: 'user', content: 'Hi' }],
      }

      const result = await middleware.wrapGenerate!({
        doGenerate,
        params,
        model: {} as WrapGenerateParams['model'],
      } as unknown as WrapGenerateParams)

      expect(mockCompletion).toHaveBeenCalledWith(
        {
          provider: providerName,
          model,
          input: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hi' }],
              toolCalls: [],
            },
          ],
          configuration: {
            model,
            prompt: [{ role: 'user', content: 'Hi' }],
          },
          promptUuid: undefined,
          versionUuid: undefined,
          experimentUuid: undefined,
        },
        mockContext,
      )
      expect(doGenerate).toHaveBeenCalled()
      expect(mockSpanEnd).toHaveBeenCalledWith({
        output: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello, world!' }],
            toolCalls: [],
          },
        ],
        tokens: {
          prompt: 10,
          completion: 5,
          cached: undefined,
          reasoning: undefined,
        },
        finishReason: 'stop',
      })
      expect(result).toBe(mockResult)
    })

    it('passes optional uuids to completion span', async () => {
      const promptUuid = 'prompt-123'
      const versionUuid = 'version-456'
      const experimentUuid = 'experiment-789'

      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
        promptUuid,
        versionUuid,
        experimentUuid,
      })

      const mockResult = {
        content: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        finishReason: 'stop',
      }
      const doGenerate = vi.fn().mockResolvedValue(mockResult)

      await middleware.wrapGenerate!({
        doGenerate,
        params: { prompt: [] },
        model: {} as WrapGenerateParams['model'],
      } as unknown as WrapGenerateParams)

      expect(mockCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          promptUuid,
          versionUuid,
          experimentUuid,
        }),
        mockContext,
      )
    })

    it('handles errors and fails the span', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const error = new Error('API Error')
      const doGenerate = vi.fn().mockRejectedValue(error)

      await expect(
        middleware.wrapGenerate!({
          doGenerate,
          params: { prompt: [] },
          model: {} as WrapGenerateParams['model'],
        } as unknown as WrapGenerateParams),
      ).rejects.toThrow('API Error')

      expect(mockSpanFail).toHaveBeenCalledWith(error)
      expect(mockSpanEnd).not.toHaveBeenCalled()
    })

    it('handles empty content in result', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const mockResult = {
        content: [],
        usage: { inputTokens: 5, outputTokens: 0 },
        finishReason: 'stop',
      }
      const doGenerate = vi.fn().mockResolvedValue(mockResult)

      await middleware.wrapGenerate!({
        doGenerate,
        params: { prompt: [] },
        model: {} as WrapGenerateParams['model'],
      } as unknown as WrapGenerateParams)

      expect(mockSpanEnd).toHaveBeenCalledWith({
        output: [{ role: 'assistant', content: [], toolCalls: [] }],
        tokens: {
          prompt: 5,
          completion: 0,
          cached: undefined,
          reasoning: undefined,
        },
        finishReason: 'stop',
      })
    })

    it('runs doGenerate within otel context', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const mockResult = {
        content: [],
        usage: {},
        finishReason: 'stop',
      }

      const otelContextSpy = vi.spyOn(otelContext, 'with')
      const doGenerate = vi.fn().mockResolvedValue(mockResult)

      await middleware.wrapGenerate!({
        doGenerate,
        params: { prompt: [] },
        model: {} as WrapGenerateParams['model'],
      } as unknown as WrapGenerateParams)

      expect(otelContextSpy).toHaveBeenCalledWith(
        mockSpanContext,
        expect.any(Function),
      )
    })
  })

  describe('wrapStream', () => {
    function createMockStream(chunks: unknown[]) {
      return new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk)
          }
          controller.close()
        },
      })
    }

    async function consumeStream(stream: ReadableStream) {
      const reader = stream.getReader()
      const chunks: unknown[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
      return chunks
    }

    it('creates a completion span and streams response', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const mockChunks = [
        { type: 'text-delta', delta: 'Hello, ' },
        { type: 'text-delta', delta: 'world!' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 2 },
        },
      ]

      const mockStream = createMockStream(mockChunks)
      const doStream = vi.fn().mockResolvedValue({ stream: mockStream })

      const result = await middleware.wrapStream!({
        doStream,
        params: { prompt: [{ role: 'user', content: 'Hi' }] },
        model: {} as WrapStreamParams['model'],
      } as unknown as WrapStreamParams)

      expect(mockCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: providerName,
          model,
          input: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hi' }],
              toolCalls: [],
            },
          ],
        }),
        mockContext,
      )

      const consumedChunks = await consumeStream(result.stream)

      // Wait a bit for the stream consumer callback to be invoked
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(consumedChunks).toEqual(mockChunks)
      expect(mockSpanEnd).toHaveBeenCalledWith({
        output: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello, world!' }],
            toolCalls: [],
          },
        ],
        tokens: {
          prompt: 10,
          completion: 2,
          cached: undefined,
          reasoning: undefined,
        },
        finishReason: 'stop',
      })
    })

    it('handles stream without text content', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const mockChunks = [
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 5, outputTokens: 0 },
        },
      ]

      const mockStream = createMockStream(mockChunks)
      const doStream = vi.fn().mockResolvedValue({ stream: mockStream })

      const result = await middleware.wrapStream!({
        doStream,
        params: { prompt: [] },
        model: {} as WrapStreamParams['model'],
      } as unknown as WrapStreamParams)

      await consumeStream(result.stream)

      // Wait a bit for the stream consumer callback to be invoked
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockSpanEnd).toHaveBeenCalledWith({
        output: [{ role: 'assistant', content: [], toolCalls: [] }],
        tokens: {
          prompt: 5,
          completion: 0,
          cached: undefined,
          reasoning: undefined,
        },
        finishReason: 'stop',
      })
    })

    it('defaults finishReason to unknown when not provided', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const mockChunks = [{ type: 'text-delta', delta: 'Hello' }]

      const mockStream = createMockStream(mockChunks)
      const doStream = vi.fn().mockResolvedValue({ stream: mockStream })

      const result = await middleware.wrapStream!({
        doStream,
        params: { prompt: [] },
        model: {} as WrapStreamParams['model'],
      } as unknown as WrapStreamParams)

      await consumeStream(result.stream)

      // Wait a bit for the stream consumer callback to be invoked
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockSpanEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          finishReason: 'unknown',
        }),
      )
    })

    it('handles errors during stream creation and fails the span', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const error = new Error('Stream Error')
      const doStream = vi.fn().mockRejectedValue(error)

      await expect(
        middleware.wrapStream!({
          doStream,
          params: { prompt: [] },
          model: {} as WrapStreamParams['model'],
        } as unknown as WrapStreamParams),
      ).rejects.toThrow('Stream Error')

      expect(mockSpanFail).toHaveBeenCalledWith(error)
      expect(mockSpanEnd).not.toHaveBeenCalled()
    })

    it('passes optional uuids to completion span for streams', async () => {
      const promptUuid = 'prompt-123'
      const versionUuid = 'version-456'
      const experimentUuid = 'experiment-789'

      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
        promptUuid,
        versionUuid,
        experimentUuid,
      })

      const mockStream = createMockStream([
        { type: 'finish', finishReason: 'stop', usage: {} },
      ])
      const doStream = vi.fn().mockResolvedValue({ stream: mockStream })

      const result = await middleware.wrapStream!({
        doStream,
        params: { prompt: [] },
        model: {} as WrapStreamParams['model'],
      } as unknown as WrapStreamParams)

      await consumeStream(result.stream)

      // Wait a bit for the stream consumer callback to be invoked
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          promptUuid,
          versionUuid,
          experimentUuid,
        }),
        mockContext,
      )
    })

    it('runs doStream within otel context', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const mockStream = createMockStream([])
      const doStream = vi.fn().mockResolvedValue({ stream: mockStream })

      const otelContextSpy = vi.spyOn(otelContext, 'with')

      await middleware.wrapStream!({
        doStream,
        params: { prompt: [] },
        model: {} as WrapStreamParams['model'],
      } as unknown as WrapStreamParams)

      expect(otelContextSpy).toHaveBeenCalledWith(
        mockSpanContext,
        expect.any(Function),
      )
    })

    it('preserves other properties from stream result', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const mockStream = createMockStream([])
      const extraProp = { someData: 'value' }
      const doStream = vi.fn().mockResolvedValue({
        stream: mockStream,
        extra: extraProp,
      })

      const result = await middleware.wrapStream!({
        doStream,
        params: { prompt: [] },
        model: {} as WrapStreamParams['model'],
      } as unknown as WrapStreamParams)

      expect((result as unknown as { extra: typeof extraProp }).extra).toBe(
        extraProp,
      )
    })
  })
})

describe('convertPromptToMessages (indirect)', () => {
  const mockContext = ROOT_CONTEXT as TelemetryContext

  let mockSpanEnd: ReturnType<typeof vi.fn>
  let mockSpanFail: ReturnType<typeof vi.fn>
  let mockCompletion: ReturnType<typeof vi.fn>

  beforeEach((ctx: TelemetryMocks) => {
    mockSpanEnd = vi.fn()
    mockSpanFail = vi.fn()

    const mockCompletionSpan = {
      context: ROOT_CONTEXT as TelemetryContext,
      end: mockSpanEnd,
      fail: mockSpanFail,
    }

    mockCompletion = vi.fn(() => mockCompletionSpan)

    const mockTelemetry = {
      span: {
        completion: mockCompletion,
      },
    }

    ctx.mocks.telemetry.sdk.mockReturnValue(mockTelemetry)
  })

  it('converts object prompts to messages', async () => {
    const middleware = createTelemetryMiddleware({
      context: mockContext,
      providerName: 'test',
      model: 'test-model',
    })

    const mockResult = { content: [], usage: {}, finishReason: 'stop' }
    const doGenerate = vi.fn().mockResolvedValue(mockResult)

    await middleware.wrapGenerate!({
      doGenerate,
      params: {
        prompt: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
      },
      model: {} as WrapGenerateParams['model'],
    } as unknown as WrapGenerateParams)

    expect(mockCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [
          {
            role: 'system',
            content: [{ type: 'text', text: 'You are helpful' }],
            toolCalls: [],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            toolCalls: [],
          },
        ],
      }),
      mockContext,
    )
  })
})

describe('extractTextFromContent (indirect)', () => {
  const mockContext = ROOT_CONTEXT as TelemetryContext

  let mockSpanEnd: ReturnType<typeof vi.fn>
  let mockSpanFail: ReturnType<typeof vi.fn>
  let mockCompletion: ReturnType<typeof vi.fn>

  beforeEach((ctx: TelemetryMocks) => {
    mockSpanEnd = vi.fn()
    mockSpanFail = vi.fn()

    const mockCompletionSpan = {
      context: ROOT_CONTEXT as TelemetryContext,
      end: mockSpanEnd,
      fail: mockSpanFail,
    }

    mockCompletion = vi.fn(() => mockCompletionSpan)

    const mockTelemetry = {
      span: {
        completion: mockCompletion,
      },
    }

    ctx.mocks.telemetry.sdk.mockReturnValue(mockTelemetry)
  })

  it('extracts text from content array with text parts', async () => {
    const middleware = createTelemetryMiddleware({
      context: mockContext,
      providerName: 'test',
      model: 'test-model',
    })

    const mockResult = {
      content: [
        { type: 'text', text: 'Part 1 ' },
        { type: 'text', text: 'Part 2' },
      ],
      usage: {},
      finishReason: 'stop',
    }
    const doGenerate = vi.fn().mockResolvedValue(mockResult)

    await middleware.wrapGenerate!({
      doGenerate,
      params: { prompt: [] },
      model: {} as WrapGenerateParams['model'],
    } as unknown as WrapGenerateParams)

    expect(mockSpanEnd).toHaveBeenCalledWith({
      output: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Part 1 Part 2' }],
          toolCalls: [],
        },
      ],
      tokens: {
        cached: undefined,
        completion: undefined,
        prompt: undefined,
        reasoning: undefined,
      },
      finishReason: 'stop',
    })
  })

  it('handles non-text content parts', async () => {
    const middleware = createTelemetryMiddleware({
      context: mockContext,
      providerName: 'test',
      model: 'test-model',
    })

    const mockResult = {
      content: [
        { type: 'image', image: 'base64...' },
        { type: 'text', text: 'With text' },
      ],
      usage: {},
      finishReason: 'stop',
    }
    const doGenerate = vi.fn().mockResolvedValue(mockResult)

    await middleware.wrapGenerate!({
      doGenerate,
      params: { prompt: [] },
      model: {} as WrapGenerateParams['model'],
    } as unknown as WrapGenerateParams)

    expect(mockSpanEnd).toHaveBeenCalledWith({
      output: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'With text' }],
          toolCalls: [],
        },
      ],
      tokens: {
        cached: undefined,
        completion: undefined,
        prompt: undefined,
        reasoning: undefined,
      },
      finishReason: 'stop',
    })
  })

  it('returns empty output for non-array content', async () => {
    const middleware = createTelemetryMiddleware({
      context: mockContext,
      providerName: 'test',
      model: 'test-model',
    })

    const mockResult = {
      content: 'just a string',
      usage: {},
      finishReason: 'stop',
    }
    const doGenerate = vi.fn().mockResolvedValue(mockResult)

    await middleware.wrapGenerate!({
      doGenerate,
      params: { prompt: [] },
      model: {} as WrapGenerateParams['model'],
    } as unknown as WrapGenerateParams)

    expect(mockSpanEnd).toHaveBeenCalledWith({
      output: [{ role: 'assistant', content: [], toolCalls: [] }],
      tokens: {
        cached: undefined,
        completion: undefined,
        prompt: undefined,
        reasoning: undefined,
      },
      finishReason: 'stop',
    })
  })
})
