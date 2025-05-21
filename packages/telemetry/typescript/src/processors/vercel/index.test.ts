import { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { describe, it, expect } from 'vitest'
import { AISemanticConventions } from './conventions'
import { VercelSpanProcessor } from './index'

describe('VercelSpanProcessor', () => {
  // @ts-ignore
  const createMockSpan = (attributes: Record<string, any>): ReadableSpan => ({
    attributes,
    name: 'test-span',
    kind: 0,
    spanContext: () => ({
      traceId: '1',
      spanId: '1',
      traceFlags: 1,
    }),
    startTime: [0, 0],
    endTime: [0, 0],
    ended: true,
    status: { code: 0 },
    resource: {} as any,
    instrumentationLibrary: {} as any,
    duration: [0, 0],
    events: [],
    links: [],
  })

  describe('attribute computation', () => {
    it('should compute basic LLM attributes correctly', () => {
      const processor = new VercelSpanProcessor({} as any)
      const mockSpan = createMockSpan({
        'ai.model.id': 'gpt-4',
        'ai.prompt.messages': JSON.stringify([
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ]),
        'ai.response.text': 'Final response',
        'ai.usage.completionTokens': 10,
        'ai.usage.promptTokens': 5,
      })

      processor.onEnd(mockSpan)

      expect(mockSpan.attributes).toMatchObject({
        'gen_ai.request.model': 'gpt-4',
        'gen_ai.response.model': 'gpt-4',
        'llm.request.type': 'chat',
        'gen_ai.prompt.0.role': 'user',
        'gen_ai.prompt.0.content': 'Hello',
        'gen_ai.prompt.1.role': 'assistant',
        'gen_ai.prompt.1.content': 'Hi there!',
        'gen_ai.completion.0.role': 'assistant',
        'gen_ai.completion.0.content': 'Final response',
        'gen_ai.usage.completion_tokens': 10,
        'gen_ai.usage.prompt_tokens': 5,
        'llm.usage.total_tokens': 15,
      })
    })

    it('should handle tool calls correctly', () => {
      const processor = new VercelSpanProcessor({} as any)
      const toolCalls = [
        {
          toolCallId: 'call_123',
          toolName: 'get_weather',
          args: '{"location": "London"}',
        },
      ]

      const mockSpan = createMockSpan({
        'ai.model.id': 'gpt-4',
        'ai.response.toolCalls': JSON.stringify(toolCalls),
      })

      processor.onEnd(mockSpan)

      expect(mockSpan.attributes).toMatchObject({
        'gen_ai.completion.0.finish_reason': 'tool_calls',
        'gen_ai.completion.0.role': 'assistant',
        'gen_ai.completion.0.tool_calls.0.id': 'call_123',
        'gen_ai.completion.0.tool_calls.0.name': 'get_weather',
        'gen_ai.completion.0.tool_calls.0.arguments': '{"location": "London"}',
      })
    })

    it('should handle settings correctly', () => {
      const processor = new VercelSpanProcessor({} as any)
      const mockSpan = createMockSpan({
        [AISemanticConventions.SETTINGS]: JSON.stringify({
          maxTokens: 100,
          provider: 'openai',
        }),
      })

      processor.onEnd(mockSpan)

      expect(mockSpan.attributes).toMatchObject({
        'gen_ai.request.max_tokens': 100,
        'gen_ai.system': 'openai',
      })
    })

    it('should handle invalid JSON gracefully', () => {
      const processor = new VercelSpanProcessor({} as any)
      const mockSpan = createMockSpan({
        'ai.prompt.messages': 'invalid-json',
        [AISemanticConventions.SETTINGS]: 'invalid-json',
      })

      expect(() => processor.onEnd(mockSpan)).not.toThrow()
    })

    it('should skip processing for non-AI spans', () => {
      const processor = new VercelSpanProcessor({} as any)
      const mockSpan = createMockSpan({
        'some.other.attribute': 'value',
      })

      const originalAttributes = { ...mockSpan.attributes }
      processor.onEnd(mockSpan)

      expect(mockSpan.attributes).toEqual(originalAttributes)
    })

    it('should handle complex LLM attributes with tools and system messages', () => {
      const processor = new VercelSpanProcessor({} as any)
      const mockSpan = createMockSpan({
        'ai.model.id': 'gpt-4o-mini',
        'gen_ai.system': 'openai.chat',
        'ai.operationId': 'ai.generateText.doGenerate',
        'ai.response.id': 'chatcmpl-Ag7Bby0zB6RCAY8AhtSo5tTPd2zUh',
        'operation.name': 'ai.generateText.doGenerate',
        'ai.prompt.tools': JSON.stringify({
          type: 'function',
          name: '0',
          description: 'Get the weather for a location',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The location to get the weather for',
              },
            },
            required: ['location'],
          },
        }),
        'ai.prompt.format': 'messages',
        'ai.response.text':
          "I'm here and ready to assist you with any weather-related questions or forecasts you may have! How can I help you today?",
        'ai.model.provider': 'openai.chat',
        'ai.response.model': 'gpt-4o-mini-2024-07-18',
        'ai.prompt.messages': JSON.stringify([
          {
            role: 'system',
            content:
              'You are a professional meteorologist and weather forecaster with years of experience. Provide detailed, accurate weather information and forecasts in a clear, professional manner. When discussing weather patterns, include relevant meteorological terms and explanations while keeping the information accessible. If asked about weather in specific locations, you should always use the getWeather function to get current data before providing your analysis.',
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'how u doing' }],
          },
        ]),
        'gen_ai.response.id': 'chatcmpl-Ag7Bby0zB6RCAY8AhtSo5tTPd2zUh',
        'ai.prompt.toolChoice': JSON.stringify({ type: 'auto' }),
        'gen_ai.request.model': 'gpt-4o-mini',
        'ai.response.timestamp': '2024-12-19T09:32:43.000Z',
        'ai.settings.maxTokens': 1000,
        'ai.usage.promptTokens': 129,
        'gen_ai.response.model': 'gpt-4o-mini-2024-07-18',
        'ai.settings.maxRetries': 2,
        'ai.response.finishReason': 'stop',
        'ai.usage.completionTokens': 26,
      })

      processor.onEnd(mockSpan)

      expect(mockSpan.attributes).toMatchObject({
        'gen_ai.request.model': 'gpt-4o-mini',
        'gen_ai.response.model': 'gpt-4o-mini',
        'llm.request.type': 'chat',
        'gen_ai.prompt.0.role': 'system',
        'gen_ai.prompt.0.content':
          'You are a professional meteorologist and weather forecaster with years of experience. Provide detailed, accurate weather information and forecasts in a clear, professional manner. When discussing weather patterns, include relevant meteorological terms and explanations while keeping the information accessible. If asked about weather in specific locations, you should always use the getWeather function to get current data before providing your analysis.',
        'gen_ai.prompt.1.role': 'user',
        'gen_ai.prompt.1.content': JSON.stringify([
          { type: 'text', text: 'how u doing' },
        ]),
        'gen_ai.completion.0.role': 'assistant',
        'gen_ai.completion.0.content':
          "I'm here and ready to assist you with any weather-related questions or forecasts you may have! How can I help you today?",
        'gen_ai.usage.completion_tokens': 26,
        'gen_ai.usage.prompt_tokens': 129,
        'llm.usage.total_tokens': 155,
        'gen_ai.system': 'openai.chat',
      })
    })
  })
})
