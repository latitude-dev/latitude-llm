import { ToolSource } from '@latitude-data/constants/toolSources'
import { ResolvedToolsDict } from '@latitude-data/constants/tools'
import { context as otelContext, ROOT_CONTEXT } from '@opentelemetry/api'
import type { LanguageModelMiddleware } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TelemetryContext } from '../../telemetry'
import * as telemetryModule from '../../telemetry'
import { createTelemetryMiddleware } from './telemetryMiddleware'

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

  beforeEach(() => {
    mockSpanContext = ROOT_CONTEXT as TelemetryContext
    mockSpanEnd = vi.fn()
    mockSpanFail = vi.fn()

    const mockCompletionSpan = {
      context: mockSpanContext,
      end: mockSpanEnd,
      fail: mockSpanFail,
    }

    vi.spyOn(telemetryModule.telemetry.span, 'completion').mockReturnValue(
      mockCompletionSpan,
    )
  })

  describe('wrapGenerate', () => {
    it('creates a completion span and calls doGenerate', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const mockResult = {
        content: [{ type: 'text' as const, text: 'Hello, world!' }],
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        finishReason: 'stop' as const,
        warnings: [],
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

      expect(telemetryModule.telemetry.span.completion).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: providerName,
          model,
          input: expect.any(Array),
          configuration: expect.objectContaining({ model }),
        }),
        mockContext,
      )
      expect(doGenerate).toHaveBeenCalled()
      expect(mockSpanEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.any(Array),
          tokens: expect.objectContaining({
            prompt: 10,
            completion: 5,
          }),
          finishReason: 'stop',
        }),
      )
      expect(result).toBe(mockResult)
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

    it('runs doGenerate within otel context', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const mockResult = {
        content: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop' as const,
        warnings: [],
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

    it('extracts token usage from result', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const mockResult = {
        content: [{ type: 'text' as const, text: 'Response' }],
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          cachedInputTokens: 25,
          reasoningTokens: 10,
        },
        finishReason: 'stop' as const,
        warnings: [],
      }
      const doGenerate = vi.fn().mockResolvedValue(mockResult)

      await middleware.wrapGenerate!({
        doGenerate,
        params: { prompt: [] },
        model: {} as WrapGenerateParams['model'],
      } as unknown as WrapGenerateParams)

      expect(mockSpanEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: {
            prompt: 100,
            completion: 50,
            cached: 25,
            reasoning: 10,
          },
        }),
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
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '2', delta: 'Hello, ' },
        { type: 'text-delta', id: '3', delta: 'world!' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
        },
      ]

      const mockStream = createMockStream(mockChunks)
      const doStream = vi.fn().mockResolvedValue({ stream: mockStream })

      const result = await middleware.wrapStream!({
        doStream,
        params: { prompt: [{ role: 'user', content: 'Hi' }] },
        model: {} as WrapStreamParams['model'],
      } as unknown as WrapStreamParams)

      expect(telemetryModule.telemetry.span.completion).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: providerName,
          model,
          input: expect.any(Array),
        }),
        mockContext,
      )

      const consumedChunks = await consumeStream(result.stream)
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(consumedChunks).toEqual(mockChunks)
      expect(mockSpanEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.any(Array),
          tokens: expect.objectContaining({
            prompt: 10,
            completion: 2,
          }),
          finishReason: 'stop',
        }),
      )
    })

    it('defaults finishReason to unknown when not provided', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const mockChunks = [
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '2', delta: 'Hello' },
      ]

      const mockStream = createMockStream(mockChunks)
      const doStream = vi.fn().mockResolvedValue({ stream: mockStream })

      const result = await middleware.wrapStream!({
        doStream,
        params: { prompt: [] },
        model: {} as WrapStreamParams['model'],
      } as unknown as WrapStreamParams)

      await consumeStream(result.stream)
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

    it('accumulates reasoning from stream', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const mockChunks = [
        { type: 'reasoning-start', id: '1' },
        { type: 'reasoning-delta', id: '2', delta: 'Step 1: ' },
        { type: 'reasoning-delta', id: '3', delta: 'think about it' },
        { type: 'text-start', id: '4' },
        { type: 'text-delta', id: '5', delta: 'The answer' },
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
      ]

      const mockStream = createMockStream(mockChunks)
      const doStream = vi.fn().mockResolvedValue({ stream: mockStream })

      const result = await middleware.wrapStream!({
        doStream,
        params: { prompt: [] },
        model: {} as WrapStreamParams['model'],
      } as unknown as WrapStreamParams)

      await consumeStream(result.stream)
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockSpanEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: expect.objectContaining({
            reasoning: 10,
          }),
        }),
      )
    })
  })

  describe('addToolSourceData', () => {
    it('adds tool source data to output messages', async () => {
      const resolvedTools: ResolvedToolsDict = {
        myTool: {
          definition: {} as ResolvedToolsDict[string]['definition'],
          sourceData: {
            source: ToolSource.Client,
          },
        },
      }

      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
        resolvedTools,
      })

      const mockResult = {
        content: [
          {
            type: 'tool-call' as const,
            toolCallId: 'call-123',
            toolName: 'myTool',
            input: '{}',
          },
        ],
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        finishReason: 'tool-calls' as const,
        warnings: [],
      }
      const doGenerate = vi.fn().mockResolvedValue(mockResult)

      await middleware.wrapGenerate!({
        doGenerate,
        params: { prompt: [] },
        model: {} as WrapGenerateParams['model'],
      } as unknown as WrapGenerateParams)

      expect(mockSpanEnd).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.arrayContaining([
            expect.objectContaining({
              role: 'assistant',
              content: expect.arrayContaining([
                expect.objectContaining({
                  type: 'tool-call',
                  _sourceData: { source: ToolSource.Client },
                }),
              ]),
            }),
          ]),
        }),
      )
    })

    it('adds tool source data to input messages with tool calls', async () => {
      const resolvedTools: ResolvedToolsDict = {
        searchTool: {
          definition: {} as ResolvedToolsDict[string]['definition'],
          sourceData: {
            source: ToolSource.Integration,
            integrationId: 42,
            toolLabel: 'Search',
            imageUrl: 'https://example.com/icon.png',
          },
        },
      }

      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
        resolvedTools,
      })

      const mockResult = {
        content: [{ type: 'text' as const, text: 'Done' }],
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        finishReason: 'stop' as const,
        warnings: [],
      }
      const doGenerate = vi.fn().mockResolvedValue(mockResult)

      await middleware.wrapGenerate!({
        doGenerate,
        params: {
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'searchTool',
                  args: {},
                },
              ],
            },
          ],
        },
        model: {} as WrapGenerateParams['model'],
      } as unknown as WrapGenerateParams)

      expect(telemetryModule.telemetry.span.completion).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.arrayContaining([
            expect.objectContaining({
              role: 'assistant',
              content: expect.arrayContaining([
                expect.objectContaining({
                  type: 'tool-call',
                  _sourceData: expect.objectContaining({
                    source: ToolSource.Integration,
                    integrationId: 42,
                  }),
                }),
              ]),
            }),
          ]),
        }),
        mockContext,
      )
    })
  })

  describe('prompt translation', () => {
    it('translates user message with string content', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const mockResult = {
        content: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop' as const,
        warnings: [],
      }
      const doGenerate = vi.fn().mockResolvedValue(mockResult)

      await middleware.wrapGenerate!({
        doGenerate,
        params: {
          prompt: [{ role: 'user', content: 'Hello there' }],
        },
        model: {} as WrapGenerateParams['model'],
      } as unknown as WrapGenerateParams)

      expect(telemetryModule.telemetry.span.completion).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.arrayContaining([
                expect.objectContaining({ type: 'text', text: 'Hello there' }),
              ]),
            }),
          ]),
        }),
        mockContext,
      )
    })

    it('translates system message', async () => {
      const middleware = createTelemetryMiddleware({
        context: mockContext,
        providerName,
        model,
      })

      const mockResult = {
        content: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop' as const,
        warnings: [],
      }
      const doGenerate = vi.fn().mockResolvedValue(mockResult)

      await middleware.wrapGenerate!({
        doGenerate,
        params: {
          prompt: [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
          ],
        },
        model: {} as WrapGenerateParams['model'],
      } as unknown as WrapGenerateParams)

      expect(telemetryModule.telemetry.span.completion).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
            }),
            expect.objectContaining({
              role: 'user',
            }),
          ]),
        }),
        mockContext,
      )
    })
  })
})
