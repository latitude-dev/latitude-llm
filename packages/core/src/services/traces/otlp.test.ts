import { describe, expect, it } from 'vitest'

import { processSpan } from './otlp'

describe('processSpan', () => {
  it('correctly processes tool calls in input messages', () => {
    const span = {
      traceId: '123',
      spanId: '456',
      name: 'test',
      kind: 1,
      startTimeUnixNano: '1000000000',
      attributes: {
        'gen_ai.system': 'OpenAI',
        'llm.request.type': 'chat',
        'gen_ai.prompt.0.role': 'tool',
        'gen_ai.prompt.0.content':
          '{"temperature":7.88,"description":"light rain"}',
        'gen_ai.prompt.0.tool_name': 'get_weather',
        'gen_ai.prompt.0.tool_call_id': 'call_123',
        'gen_ai.request.model': 'gpt-4',
      },
    }

    // @ts-expect-error - mock
    const result = processSpan({ span })
    const parsedInput = JSON.parse(result.input as string)

    expect(parsedInput[0]).toEqual({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call_123',
          toolName: 'get_weather',
          result: {
            temperature: 7.88,
            description: 'light rain',
          },
          isError: false,
        },
      ],
    })
  })

  it('correctly processes tool calls in output messages', () => {
    const span = {
      traceId: '123',
      spanId: '456',
      name: 'test',
      kind: 1,
      startTimeUnixNano: '1000000000',
      attributes: [
        {
          key: 'gen_ai.system',
          value: { stringValue: 'OpenAI' },
        },
        {
          key: 'llm.request.type',
          value: { stringValue: 'chat' },
        },
        {
          key: 'gen_ai.completion.0.role',
          value: { stringValue: 'assistant' },
        },
        {
          key: 'gen_ai.completion.0.content',
          value: { stringValue: '' },
        },
        {
          key: 'gen_ai.completion.0.finish_reason',
          value: { stringValue: 'tool_calls' },
        },
        {
          key: 'gen_ai.completion.0.tool_calls.0.name',
          value: { stringValue: 'getWeather' },
        },
        {
          key: 'gen_ai.completion.0.tool_calls.0.arguments',
          value: { stringValue: '{"location":"Berlin"}' },
        },
        {
          key: 'gen_ai.request.model',
          value: { stringValue: 'gpt-4' },
        },
      ],
    }

    const result = processSpan({ span })
    const parsedOutput = JSON.parse(result.output as string)

    expect(parsedOutput[0]).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call_0_0',
          toolName: 'getWeather',
          args: {
            location: 'Berlin',
          },
        },
      ],
    })
  })

  it('should extract tool calls from generation spans', () => {
    const span = {
      traceId: '1234',
      spanId: '5678',
      name: 'test',
      kind: 1,
      startTimeUnixNano: '1234567890000000',
      attributes: [
        { key: 'gen_ai.system', value: { stringValue: 'OpenAI' } },
        { key: 'llm.request.type', value: { stringValue: 'chat' } },
        { key: 'gen_ai.request.model', value: { stringValue: 'gpt-4' } },
        {
          key: 'llm.request.functions.0.name',
          value: { stringValue: 'getWeather' },
        },
        {
          key: 'llm.request.functions.0.description',
          value: { stringValue: 'Get weather info' },
        },
        {
          key: 'gen_ai.completion.0.tool_calls.0.name',
          value: { stringValue: 'getWeather' },
        },
        {
          key: 'gen_ai.completion.0.tool_calls.0.arguments',
          value: { stringValue: '{"location":"New York"}' },
        },
        { key: 'llm.usage.total_tokens', value: { stringValue: '100' } },
        { key: 'gen_ai.usage.prompt_tokens', value: { stringValue: '50' } },
        { key: 'gen_ai.usage.completion_tokens', value: { stringValue: '50' } },
      ],
    }

    const result = processSpan({ span })
    const toolCalls = result.toolCalls

    expect(toolCalls).toEqual([
      {
        id: '0-0',
        name: 'getWeather',
        description: 'Get weather info',
        arguments: { location: 'New York' },
      },
    ])
  })

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
          value: { stringValue: '/prompts/test.prompt' },
        },
        { key: 'latitude.distinctId', value: { stringValue: 'user123' } },
        {
          key: 'latitude.versionUuid',
          value: { stringValue: '550e8400-e29b-41d4-a716-446655440000' },
        },
        { key: 'latitude.metadata', value: { stringValue: '{"key":"value"}' } },
      ],
    }

    const result = processSpan({ span })

    expect(result.promptPath).toBe('/prompts/test.prompt')
    expect(result.distinctId).toBe('user123')
    expect(result.commitUuid).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(result.metadata).toBe('{"key":"value"}')
  })
})
