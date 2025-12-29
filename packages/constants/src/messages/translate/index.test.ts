import { describe, expect, it } from 'vitest'
import { translateMessages } from '.'

describe('translateMessages', () => {
  it('translates OpenAI Chat Completions messages', () => {
    const messages = [
      {
        role: 'system',
        content:
          "You are a careful assistant. When you use tools, explain what you're doing briefly.",
      },
      {
        role: 'user',
        content:
          "What's the weather in Madrid right now, and should I take an umbrella?",
      },
      {
        role: 'assistant',
        content: "I'll check the current weather in Madrid.",
        tool_calls: [
          {
            id: 'call_01HZZY7K2X0W8A',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location":"Madrid, ES","units":"metric"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call_01HZZY7K2X0W8A',
        content:
          '{"temp_c":12.8,"precip_mm":0.0,"precip_prob":0.15,"wind_kph":18,"summary":"Mostly cloudy"}',
      },
      {
        role: 'assistant',
        content:
          "It's about 13°C and mostly cloudy with low rain probability. An umbrella is optional; a light jacket is more useful because it's breezy.",
      },
    ]

    const result = translateMessages(messages)

    expect(result).toEqual([
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: "You are a careful assistant. When you use tools, explain what you're doing briefly.",
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: "What's the weather in Madrid right now, and should I take an umbrella?",
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: "I'll check the current weather in Madrid.",
          },
        ],
        toolCalls: [
          {
            id: 'call_01HZZY7K2X0W8A',
            name: 'get_weather',
            arguments: { location: 'Madrid, ES', units: 'metric' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_01HZZY7K2X0W8A',
            toolName: 'unknown',
            result: {
              temp_c: 12.8,
              precip_mm: 0.0,
              precip_prob: 0.15,
              wind_kph: 18,
              summary: 'Mostly cloudy',
            },
            isError: false,
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: "It's about 13°C and mostly cloudy with low rain probability. An umbrella is optional; a light jacket is more useful because it's breezy.",
          },
        ],
      },
    ])
  })

  it('translates OpenAI Responses messages', () => {
    const messages = [
      {
        type: 'message',
        role: 'developer',
        content: [
          {
            type: 'input_text',
            text: 'If a user asks for math, show the steps.',
          },
        ],
      },
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Compute 17*23 and also tell me the current time in Madrid.',
          },
        ],
      },
      {
        type: 'reasoning',
        summary: 'Need multiplication; time requires tool.',
      },
      {
        type: 'function_call',
        call_id: 'call_time_001',
        name: 'get_time',
        arguments: { timezone: 'Europe/Madrid' },
      },
      {
        type: 'function_call_output',
        call_id: 'call_time_001',
        output: { iso: '2025-12-23T14:05:12+01:00' },
      },
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: '17×23 = 17×(20+3) = 340+51 = 391.\nMadrid time: 2025-12-23T14:05:12+01:00.',
          },
        ],
      },
    ]

    const result = translateMessages(messages)

    expect(result).toEqual([
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'If a user asks for math, show the steps.',
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Compute 17*23 and also tell me the current time in Madrid.',
          },
        ],
      },
      {
        role: 'assistant',
        toolCalls: [
          {
            id: 'call_time_001',
            name: 'get_time',
            arguments: { timezone: 'Europe/Madrid' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_time_001',
            toolName: '',
            result: { iso: '2025-12-23T14:05:12+01:00' },
            isError: false,
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: '17×23 = 17×(20+3) = 340+51 = 391.\nMadrid time: 2025-12-23T14:05:12+01:00.',
          },
        ],
      },
    ])
  })
})
