import { describe, expect, it } from 'vitest'
import { processSpan } from './otlp'

describe('processSpan', () => {
  describe('OpenAI', () => {
    it('correctly processes OpenAI chat completion with tool calls', () => {
      const span = {
        traceId: '123',
        spanId: '456',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        attributes: [
          { key: 'gen_ai.system', value: { stringValue: 'OpenAI' } },
          { key: 'llm.request.type', value: { stringValue: 'chat' } },
          { key: 'gen_ai.prompt.0.role', value: { stringValue: 'system' } },
          { key: 'gen_ai.prompt.1.role', value: { stringValue: 'user' } },
          {
            key: 'gen_ai.request.model',
            value: { stringValue: 'gpt-3.5-turbo' },
          },
          {
            key: 'gen_ai.response.model',
            value: { stringValue: 'gpt-3.5-turbo-0125' },
          },
          { key: 'llm.usage.total_tokens', value: { stringValue: '156' } },
          {
            key: 'gen_ai.prompt.0.content',
            value: {
              stringValue:
                'You are a professional meteorologist and weather forecaster with years of experience. Provide detailed, accurate weather information and forecasts in a clear, professional manner. When discussing weather patterns, include relevant meteorological terms and explanations while keeping the information accessible. If asked about weather in specific locations, you should always use the getWeather function to get current data before providing your analysis.',
            },
          },
          {
            key: 'gen_ai.prompt.1.content',
            value: {
              stringValue:
                '[{"type":"text","text":"what\'s the weather in paris?"}]',
            },
          },
          {
            key: 'gen_ai.completion.0.role',
            value: { stringValue: 'assistant' },
          },
          { key: 'gen_ai.request.max_tokens', value: { stringValue: '1000' } },
          { key: 'gen_ai.usage.prompt_tokens', value: { stringValue: '142' } },
          { key: 'gen_ai.completion.0.content', value: { stringValue: '' } },
          {
            key: 'llm.request.functions.0.name',
            value: { stringValue: 'getWeather' },
          },
          {
            key: 'gen_ai.usage.completion_tokens',
            value: { stringValue: '14' },
          },
          {
            key: 'gen_ai.completion.0.finish_reason',
            value: { stringValue: 'tool_calls' },
          },
          {
            key: 'llm.request.functions.0.arguments',
            value: {
              stringValue:
                '{"type":"object","properties":{"location":{"type":"string","description":"The city and state, e.g. San Francisco, CA"}},"required":["location"]}',
            },
          },
          {
            key: 'llm.request.functions.0.description',
            value: {
              stringValue: 'Get the current weather in a given location',
            },
          },
          {
            key: 'gen_ai.completion.0.tool_calls.0.name',
            value: { stringValue: 'getWeather' },
          },
          {
            key: 'gen_ai.completion.0.tool_calls.0.arguments',
            value: { stringValue: '{"location":"Paris"}' },
          },
        ],
      }

      const result = processSpan({ span })

      expect(result.model).toBe('gpt-3.5-turbo')
      expect(result.totalTokens).toBe(156)
      expect(result.inputTokens).toBe(142)
      expect(result.outputTokens).toBe(14)

      const parsedInput = result.input as any
      expect(parsedInput).toHaveLength(2)
      expect(parsedInput[0].role).toBe('system')
      expect(parsedInput[1].role).toBe('user')
      expect(parsedInput[1].content[0].type).toBe('text')
      expect(parsedInput[1].content[0].text).toBe(
        "what's the weather in paris?",
      )

      expect(result.tools).toBeDefined()
      expect(result.tools).toHaveLength(1)
      expect(result.tools![0]).toMatchObject({
        name: 'getWeather',
        description: 'Get the current weather in a given location',
        arguments: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA',
            },
          },
        },
      })
    })

    it('correctly processes OpenAI chat completion with structured output', () => {
      const span = {
        traceId: '123',
        spanId: '456',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        attributes: [
          { key: 'gen_ai.system', value: { stringValue: 'OpenAI' } },
          { key: 'llm.request.type', value: { stringValue: 'chat' } },
          { key: 'gen_ai.prompt.0.role', value: { stringValue: 'system' } },
          { key: 'gen_ai.prompt.1.role', value: { stringValue: 'user' } },
          {
            key: 'gen_ai.request.model',
            value: { stringValue: 'gpt-4o-mini' },
          },
          {
            key: 'gen_ai.response.model',
            value: { stringValue: 'gpt-4o-mini-2024-07-18' },
          },
          { key: 'llm.usage.total_tokens', value: { stringValue: '207' } },
          {
            key: 'gen_ai.prompt.0.content',
            value: {
              stringValue:
                'You are a professional meteorologist and weather forecaster with years of experience. Provide detailed, accurate weather information and forecasts in a clear, professional manner. When discussing weather patterns, include relevant meteorological terms and explanations while keeping the information accessible. If asked about weather in specific locations, you should always use the getWeather function to get current data before providing your analysis.',
            },
          },
          {
            key: 'gen_ai.prompt.1.content',
            value: {
              stringValue: '[{"type":"text","text":"how u doing today?"}]',
            },
          },
          {
            key: 'gen_ai.completion.0.role',
            value: { stringValue: 'assistant' },
          },
          { key: 'gen_ai.request.max_tokens', value: { stringValue: '1000' } },
          { key: 'gen_ai.usage.prompt_tokens', value: { stringValue: '174' } },
          {
            key: 'gen_ai.completion.0.content',
            value: {
              stringValue:
                '{"response":"I\'m here and ready to assist you with any weather-related questions or forecasts you may have! How can I help you today?"}',
            },
          },
          {
            key: 'llm.request.functions.0.name',
            value: { stringValue: 'getWeather' },
          },
          {
            key: 'gen_ai.usage.completion_tokens',
            value: { stringValue: '33' },
          },
          {
            key: 'gen_ai.completion.0.finish_reason',
            value: { stringValue: 'stop' },
          },
          {
            key: 'llm.request.functions.0.arguments',
            value: {
              stringValue:
                '{"type":"object","properties":{"location":{"type":"string","description":"The city and state, e.g. San Francisco, CA"}},"required":["location"]}',
            },
          },
          {
            key: 'llm.request.functions.0.description',
            value: {
              stringValue: 'Get the current weather in a given location',
            },
          },
        ],
      }

      const result = processSpan({ span })

      expect(result.model).toBe('gpt-4o-mini')
      expect(result.totalTokens).toBe(207)
      expect(result.inputTokens).toBe(174)
      expect(result.outputTokens).toBe(33)

      const parsedInput = result.input as any
      expect(parsedInput).toHaveLength(2)
      expect(parsedInput[0].role).toBe('system')
      expect(parsedInput[1].role).toBe('user')
      expect(parsedInput[1].content[0].type).toBe('text')
      expect(parsedInput[1].content[0].text).toBe('how u doing today?')

      const parsedOutput = result.output as any
      expect(parsedOutput).toHaveLength(1)
      expect(parsedOutput[0].role).toBe('assistant')
      const content = JSON.parse(parsedOutput[0].content as string)
      expect(content).toEqual({
        response:
          "I'm here and ready to assist you with any weather-related questions or forecasts you may have! How can I help you today?",
      })
    })
  })

  describe('Vercel', () => {
    it('correctly processes Vercel chat completion with tool calls', () => {
      const span = {
        traceId: '123',
        spanId: '456',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        attributes: [
          { key: 'ai.model.id', value: { stringValue: 'gpt-3.5-turbo' } },
          { key: 'gen_ai.system', value: { stringValue: 'openai.chat' } },
          {
            key: 'ai.operationId',
            value: { stringValue: 'ai.generateText.doGenerate' },
          },
          {
            key: 'ai.response.id',
            value: { stringValue: 'aitxt-pFw0SX4ybEhxtci7KGg0FdhB' },
          },
          {
            key: 'operation.name',
            value: { stringValue: 'ai.generateText.doGenerate' },
          },
          {
            key: 'ai.prompt.tools',
            value: {
              stringValue:
                '{"type":"function","name":"0","description":"Get the current weather in a given location","parameters":{"type":"object","properties":{"location":{"type":"string","description":"The city and state, e.g. San Francisco, CA"}},"required":["location"]}}',
            },
          },
          { key: 'ai.prompt.format', value: { stringValue: 'messages' } },
          { key: 'llm.request.type', value: { stringValue: 'chat' } },
          { key: 'ai.model.provider', value: { stringValue: 'openai.chat' } },
          { key: 'ai.response.model', value: { stringValue: 'gpt-3.5-turbo' } },
          {
            key: 'ai.prompt.messages',
            value: {
              stringValue:
                '[{"role":"system","content":"You are a professional meteorologist and weather forecaster with years of experience. Provide detailed, accurate weather information and forecasts in a clear, professional manner. When discussing weather patterns, include relevant meteorological terms and explanations while keeping the information accessible. If asked about weather in specific locations, you should always use the getWeather function to get current data before providing your analysis."},{"role":"user","content":[{"type":"text","text":"what\'s the weather in dublin?"}]}]',
            },
          },
          {
            key: 'gen_ai.response.id',
            value: { stringValue: 'aitxt-pFw0SX4ybEhxtci7KGg0FdhB' },
          },
          {
            key: 'ai.prompt.toolChoice',
            value: { stringValue: '{"type":"auto"}' },
          },
          { key: 'gen_ai.prompt.0.role', value: { stringValue: 'system' } },
          { key: 'gen_ai.prompt.1.role', value: { stringValue: 'user' } },
          {
            key: 'gen_ai.request.model',
            value: { stringValue: 'gpt-3.5-turbo' },
          },
          {
            key: 'ai.response.timestamp',
            value: { stringValue: '2024-12-09T15:20:48.154Z' },
          },
          {
            key: 'ai.response.toolCalls',
            value: {
              stringValue:
                '[{"toolCallType":"function","toolCallId":"call_QJxIVUoLQetn28hyQbkxTrYk","toolName":"0","args":"{\\"location\\":\\"Dublin\\"}"}]',
            },
          },
          { key: 'ai.usage.promptTokens', value: { stringValue: '143' } },
          {
            key: 'gen_ai.response.model',
            value: { stringValue: 'gpt-3.5-turbo' },
          },
          { key: 'ai.settings.maxRetries', value: { stringValue: '2' } },
          { key: 'ai.settings.max_tokens', value: { stringValue: '1000' } },
          { key: 'llm.usage.total_tokens', value: { stringValue: '158' } },
          {
            key: 'gen_ai.prompt.0.content',
            value: {
              stringValue:
                'You are a professional meteorologist and weather forecaster with years of experience. Provide detailed, accurate weather information and forecasts in a clear, professional manner. When discussing weather patterns, include relevant meteorological terms and explanations while keeping the information accessible. If asked about weather in specific locations, you should always use the getWeather function to get current data before providing your analysis.',
            },
          },
          {
            key: 'gen_ai.prompt.1.content',
            value: {
              stringValue:
                '[{"type":"text","text":"what\'s the weather in dublin?"}]',
            },
          },
          {
            key: 'ai.response.finishReason',
            value: { stringValue: 'tool-calls' },
          },
          {
            key: 'gen_ai.completion.0.role',
            value: { stringValue: 'assistant' },
          },
          { key: 'ai.usage.completionTokens', value: { stringValue: '15' } },
          { key: 'gen_ai.usage.input_tokens', value: { stringValue: '143' } },
          { key: 'gen_ai.usage.output_tokens', value: { stringValue: '15' } },
          { key: 'gen_ai.usage.prompt_tokens', value: { stringValue: '143' } },
          {
            key: 'gen_ai.response.finish_reasons',
            value: { stringValue: 'tool-calls' },
          },
          {
            key: 'gen_ai.usage.completion_tokens',
            value: { stringValue: '15' },
          },
          {
            key: 'gen_ai.completion.0.finish_reason',
            value: { stringValue: 'tool_calls' },
          },
          {
            key: 'gen_ai.completion.0.tool_calls.0.id',
            value: { stringValue: 'call_QJxIVUoLQetn28hyQbkxTrYk' },
          },
          {
            key: 'gen_ai.completion.0.tool_calls.0.name',
            value: { stringValue: '0' },
          },
          {
            key: 'gen_ai.completion.0.tool_calls.0.arguments',
            value: { stringValue: '{"location":"Dublin"}' },
          },
        ],
      }

      const result = processSpan({ span })

      expect(result.model).toBe('gpt-3.5-turbo')
      expect(result.totalTokens).toBe(158)
      expect(result.inputTokens).toBe(143)
      expect(result.outputTokens).toBe(15)

      const parsedInput = result.input as any
      expect(parsedInput).toHaveLength(2)
      expect(parsedInput[0].role).toBe('system')
      expect(parsedInput[1].role).toBe('user')
      expect(parsedInput[1].content[0].type).toBe('text')
      expect(parsedInput[1].content[0].text).toBe(
        "what's the weather in dublin?",
      )

      const parsedOutput = result.output as any
      expect(parsedOutput).toHaveLength(1)
      expect(parsedOutput[0].role).toBe('assistant')
      const content = parsedOutput[0].content as string
      expect(content).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_QJxIVUoLQetn28hyQbkxTrYk',
          toolName: '0',
          args: { location: 'Dublin' },
        },
      ])
    })

    it('correctly processes Vercel chat completion with structured output', () => {
      const span = {
        traceId: '123',
        spanId: '456',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        attributes: [
          { key: 'ai.model.id', value: { stringValue: 'gpt-3.5-turbo' } },
          { key: 'gen_ai.system', value: { stringValue: 'openai.chat' } },
          {
            key: 'ai.operationId',
            value: { stringValue: 'ai.generateObject.doGenerate' },
          },
          {
            key: 'ai.response.id',
            value: { stringValue: 'aiobj-pabwouiW9dwv0Xy205tUHgyW' },
          },
          {
            key: 'operation.name',
            value: { stringValue: 'ai.generateObject.doGenerate' },
          },
          { key: 'ai.prompt.format', value: { stringValue: 'messages' } },
          { key: 'ai.settings.mode', value: { stringValue: 'tool' } },
          { key: 'llm.request.type', value: { stringValue: 'chat' } },
          { key: 'ai.model.provider', value: { stringValue: 'openai.chat' } },
          { key: 'ai.response.model', value: { stringValue: 'gpt-3.5-turbo' } },
          {
            key: 'ai.prompt.messages',
            value: {
              stringValue:
                '[{"role":"system","content":"You are a professional meteorologist and weather forecaster with years of experience. Provide detailed, accurate weather information and forecasts in a clear, professional manner. When discussing weather patterns, include relevant meteorological terms and explanations while keeping the information accessible. If asked about weather in specific locations, you should always use the getWeather function to get current data before providing your analysis."},{"role":"user","content":[{"type":"text","text":"how u doing?"}]}]',
            },
          },
          {
            key: 'ai.response.object',
            value: {
              stringValue:
                '{"response":"I\'m here and ready to help with any weather-related questions or forecasts you may have. How can I assist you today?"}',
            },
          },
          {
            key: 'gen_ai.response.id',
            value: { stringValue: 'aiobj-pabwouiW9dwv0Xy205tUHgyW' },
          },
          { key: 'gen_ai.prompt.0.role', value: { stringValue: 'system' } },
          { key: 'gen_ai.prompt.1.role', value: { stringValue: 'user' } },
          {
            key: 'gen_ai.request.model',
            value: { stringValue: 'gpt-3.5-turbo' },
          },
          {
            key: 'ai.response.timestamp',
            value: { stringValue: '2024-12-09T15:55:05.465Z' },
          },
          { key: 'ai.usage.promptTokens', value: { stringValue: '128' } },
          {
            key: 'gen_ai.response.model',
            value: { stringValue: 'gpt-3.5-turbo' },
          },
          { key: 'ai.settings.maxRetries', value: { stringValue: '2' } },
          { key: 'ai.settings.max_tokens', value: { stringValue: '1000' } },
          { key: 'llm.usage.total_tokens', value: { stringValue: '157' } },
          {
            key: 'gen_ai.prompt.0.content',
            value: {
              stringValue:
                'You are a professional meteorologist and weather forecaster with years of experience. Provide detailed, accurate weather information and forecasts in a clear, professional manner. When discussing weather patterns, include relevant meteorological terms and explanations while keeping the information accessible. If asked about weather in specific locations, you should always use the getWeather function to get current data before providing your analysis.',
            },
          },
          {
            key: 'gen_ai.prompt.1.content',
            value: { stringValue: '[{"type":"text","text":"how u doing?"}]' },
          },
          { key: 'ai.response.finishReason', value: { stringValue: 'stop' } },
          {
            key: 'gen_ai.completion.0.role',
            value: { stringValue: 'assistant' },
          },
          { key: 'ai.usage.completionTokens', value: { stringValue: '29' } },
          { key: 'gen_ai.usage.input_tokens', value: { stringValue: '128' } },
          { key: 'gen_ai.usage.output_tokens', value: { stringValue: '29' } },
          { key: 'gen_ai.usage.prompt_tokens', value: { stringValue: '128' } },
          {
            key: 'gen_ai.completion.0.content',
            value: {
              stringValue:
                '{"response":"I\'m here and ready to help with any weather-related questions or forecasts you may have. How can I assist you today?"}',
            },
          },
          {
            key: 'gen_ai.response.finish_reasons',
            value: { stringValue: 'stop' },
          },
          {
            key: 'gen_ai.usage.completion_tokens',
            value: { stringValue: '29' },
          },
        ],
      }

      const result = processSpan({ span })

      expect(result.model).toBe('gpt-3.5-turbo')
      expect(result.totalTokens).toBe(157)
      expect(result.inputTokens).toBe(128)
      expect(result.outputTokens).toBe(29)

      const parsedInput = result.input as any
      expect(parsedInput).toHaveLength(2)
      expect(parsedInput[0].role).toBe('system')
      expect(parsedInput[1].role).toBe('user')
      expect(parsedInput[1].content[0].type).toBe('text')
      expect(parsedInput[1].content[0].text).toBe('how u doing?')

      const parsedOutput = result.output as any
      expect(parsedOutput).toHaveLength(1)
      expect(parsedOutput[0].role).toBe('assistant')
      const content = JSON.parse(parsedOutput[0].content)
      expect(content).toEqual({
        response:
          "I'm here and ready to help with any weather-related questions or forecasts you may have. How can I assist you today?",
      })

      // Vercel specific attributes
      expect(result.attributes?.['ai.settings.mode']).toBe('tool')
      expect(result.attributes?.['ai.operationId']).toBe(
        'ai.generateObject.doGenerate',
      )
      expect(result.attributes?.['ai.response.object']).toBe(
        '{"response":"I\'m here and ready to help with any weather-related questions or forecasts you may have. How can I assist you today?"}',
      )
    })
  })

  describe('Anthropic', () => {
    it('correctly processes Anthropic chat completion with tool calls', () => {
      const span = {
        traceId: '123',
        spanId: '456',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1000000000',
        attributes: [
          { key: 'gen_ai.system', value: { stringValue: 'Anthropic' } },
          { key: 'llm.request.type', value: { stringValue: 'chat' } },
          { key: 'gen_ai.prompt.0.role', value: { stringValue: 'user' } },
          {
            key: 'gen_ai.request.model',
            value: { stringValue: 'claude-3-5-sonnet-20240620' },
          },
          {
            key: 'gen_ai.response.model',
            value: { stringValue: 'claude-3-5-sonnet-20240620' },
          },
          { key: 'llm.usage.total_tokens', value: { stringValue: '546' } },
          {
            key: 'gen_ai.prompt.0.content',
            value: {
              stringValue:
                '[{"type":"text","text":"what\'s the weather in london?"}]',
            },
          },
          {
            key: 'gen_ai.completion.0.role',
            value: { stringValue: 'assistant' },
          },
          { key: 'gen_ai.request.max_tokens', value: { stringValue: '1000' } },
          { key: 'gen_ai.usage.prompt_tokens', value: { stringValue: '435' } },
          {
            key: 'gen_ai.completion.0.content',
            value: {
              stringValue:
                '[{"type":"text","text":"Certainly! I\'d be happy to provide you with the current weather information for London. To give you the most accurate and up-to-date information, I\'ll need to use the getWeather function to retrieve the latest data. Let me do that for you right now."},{"type":"tool_use","id":"toolu_01HocCArY36zXvgP8tYFdsep","name":"getWeather","input":{"location":"London"}}]',
            },
          },
          {
            key: 'gen_ai.usage.completion_tokens',
            value: { stringValue: '111' },
          },
          {
            key: 'gen_ai.completion.0.finish_reason',
            value: { stringValue: 'tool_use' },
          },
        ],
      }

      const result = processSpan({ span })

      expect(result.model).toBe('claude-3-5-sonnet-20240620')
      expect(result.totalTokens).toBe(546)
      expect(result.inputTokens).toBe(435)
      expect(result.outputTokens).toBe(111)

      const parsedInput = result.input as any
      expect(parsedInput).toHaveLength(1)
      expect(parsedInput[0].role).toBe('user')
      expect(parsedInput[0].content[0].type).toBe('text')
      expect(parsedInput[0].content[0].text).toBe(
        "what's the weather in london?",
      )

      const parsedOutput = result.output as any
      expect(parsedOutput).toHaveLength(1)
      expect(parsedOutput[0].content).toHaveLength(2)
      expect(parsedOutput[0].content[1].type).toBe('tool-call')
      expect(parsedOutput[0].content[1].toolName).toBe('getWeather')
      expect(parsedOutput[0].content[1].args).toEqual({ location: 'London' })
    })
  })

  describe('Latitude-specific attributes', () => {
    it('should extract Latitude-specific attributes', () => {
      const span = {
        traceId: '1234',
        spanId: '5678',
        name: 'test',
        kind: 1,
        startTimeUnixNano: '1234567890000000',
        attributes: [
          {
            key: 'latitude.prompt',
            value: {
              stringValue:
                '{"uuid":"fake-uuid","parameters":{},"versionUuid":"550e8400-e29b-41d4-a716-446655440000"}',
            },
          },
          { key: 'latitude.distinctId', value: { stringValue: 'user123' } },
          {
            key: 'latitude.metadata',
            value: { stringValue: '{"key":"value"}' },
          },
        ],
      }

      const result = processSpan({ span })

      expect(result.documentUuid).toBe('fake-uuid')
      expect(result.distinctId).toBe('user123')
      expect(result.commitUuid).toBe('550e8400-e29b-41d4-a716-446655440000')
      expect(result.metadata).toEqual({
        key: 'value',
      })
    })
  })
})
