import { MessageRole } from '@latitude-data/constants/legacyCompiler'
import {
  ChainEvent,
  ChainEventTypes,
  LatitudeProviderCompletedEventData,
  StreamEventTypes,
} from '@latitude-data/constants'

const CHUNK_EVENTS: ChainEvent[] = [
  {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.ChainStarted,
      uuid: '123',
      messages: [],
    },
  },
  {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.StepStarted,
      uuid: '123',
      messages: [
        {
          role: MessageRole.system,
          content: [{ type: 'text', text: "What's bigger 9.9 or 9.11?" }],
        },
      ],
    },
  },
  {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.ProviderStarted,
      uuid: '123',
      messages: [
        {
          role: MessageRole.system,
          content: [{ type: 'text', text: "What's bigger 9.9 or 9.11?" }],
        },
      ],
      config: {
        provider: 'openai',
        model: 'gpt-4o',
      },
    },
  },
  {
    event: StreamEventTypes.Provider,
    data: {
      type: 'text-delta',
      textDelta: '9',
    },
  },
  {
    event: StreamEventTypes.Provider,
    data: {
      type: 'text-delta',
      textDelta: '.',
    },
  },
  {
    event: StreamEventTypes.Provider,
    data: {
      type: 'text-delta',
      textDelta: '9',
    },
  },
  {
    event: StreamEventTypes.Provider,
    data: {
      type: 'text-delta',
      textDelta: ' is',
    },
  },
  {
    event: StreamEventTypes.Provider,
    data: {
      type: 'text-delta',
      textDelta: ' bigger',
    },
  },
  {
    event: StreamEventTypes.Provider,
    data: {
      type: 'text-delta',
      textDelta: ' than',
    },
  },
  {
    event: StreamEventTypes.Provider,
    data: {
      type: 'text-delta',
      textDelta: ' ',
    },
  },
  {
    event: StreamEventTypes.Provider,
    data: {
      type: 'text-delta',
      textDelta: '9',
    },
  },
  {
    event: StreamEventTypes.Provider,
    data: {
      type: 'text-delta',
      textDelta: '.',
    },
  },
  {
    event: StreamEventTypes.Provider,
    data: {
      type: 'text-delta',
      textDelta: '11',
    },
  },
  {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.ProviderCompleted,
      uuid: '123',
      messages: [
        {
          role: MessageRole.system,
          content: [{ type: 'text', text: "What's bigger 9.9 or 9.11?" }],
        },
        {
          role: MessageRole.assistant,
          content: [{ type: 'text', text: '9.9 is bigger than 9.11' }],
          toolCalls: [],
        },
      ],
      tokenUsage: {
        promptTokens: 19,
        completionTokens: 84,
        totalTokens: 103,
      },
      finishReason: 'stop',
      providerLogUuid: '456',
      response: {
        streamType: 'text',
        text: '9.9 is bigger than 9.11',
        usage: {
          promptTokens: 19,
          completionTokens: 84,
          totalTokens: 103,
        },
        toolCalls: [],
      },
    },
  },
  {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.StepCompleted,
      uuid: '123',
      messages: [
        {
          role: MessageRole.system,
          content: [{ type: 'text', text: "What's bigger 9.9 or 9.11?" }],
        },
        {
          role: MessageRole.assistant,
          content: [{ type: 'text', text: '9.9 is bigger than 9.11' }],
          toolCalls: [],
        },
      ],
    },
  },
  {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.StepStarted,
      uuid: '123',
      messages: [
        {
          role: MessageRole.system,
          content: [{ type: 'text', text: "What's bigger 9.9 or 9.11?" }],
        },
        {
          role: MessageRole.assistant,
          content: [{ type: 'text', text: '9.9 is bigger than 9.11' }],
          toolCalls: [],
        },
        {
          role: MessageRole.system,
          content: [{ type: 'text', text: 'Expand your answer' }],
        },
      ],
    },
  },
  {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.ProviderStarted,
      uuid: '123',
      messages: [
        {
          role: MessageRole.system,
          content: [{ type: 'text', text: "What's bigger 9.9 or 9.11?" }],
        },
        {
          role: MessageRole.assistant,
          content: [{ type: 'text', text: '9.9 is bigger than 9.11' }],
          toolCalls: [],
        },
        {
          role: MessageRole.system,
          content: [{ type: 'text', text: 'Expand your answer' }],
        },
      ],
      config: {
        provider: 'openai',
        model: 'gpt-4o',
      },
    },
  },
  {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.ProviderCompleted,
      uuid: '123',
      messages: [
        {
          role: MessageRole.system,
          content: [{ type: 'text', text: "What's bigger 9.9 or 9.11?" }],
        },
        {
          role: MessageRole.assistant,
          content: [{ type: 'text', text: '9.9 is bigger than 9.11' }],
          toolCalls: [],
        },
        {
          role: MessageRole.system,
          content: [{ type: 'text', text: 'Expand your answer' }],
        },
        {
          role: MessageRole.assistant,
          content: [
            {
              type: 'text',
              text: "Sure, let's break it down step by step to understand why 9.9 is greater than 9.11",
            },
          ],
          toolCalls: [],
        },
      ],
      tokenUsage: {
        promptTokens: 114,
        completionTokens: 352,
        totalTokens: 466,
      },
      finishReason: 'stop',
      providerLogUuid: '789',
      response: {
        streamType: 'text',
        text: "Sure, let's break it down step by step to understand why 9.9 is greater than 9.11",
        usage: {
          promptTokens: 114,
          completionTokens: 352,
          totalTokens: 466,
        },
        toolCalls: [],
      },
    },
  },
  {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.StepCompleted,
      uuid: '123',
      messages: [
        {
          role: MessageRole.system,
          content: [{ type: 'text', text: "What's bigger 9.9 or 9.11?" }],
        },
        {
          role: MessageRole.assistant,
          content: [{ type: 'text', text: '9.9 is bigger than 9.11' }],
          toolCalls: [],
        },
        {
          role: MessageRole.system,
          content: [{ type: 'text', text: 'Expand your answer' }],
        },
        {
          role: MessageRole.assistant,
          content: [
            {
              type: 'text',
              text: "Sure, let's break it down step by step to understand why 9.9 is greater than 9.11",
            },
          ],
          toolCalls: [],
        },
      ],
    },
  },
  {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.ChainCompleted,
      uuid: '123',
      messages: [
        {
          role: MessageRole.system,
          content: [{ type: 'text', text: "What's bigger 9.9 or 9.11?" }],
        },
        {
          role: MessageRole.assistant,
          content: [{ type: 'text', text: '9.9 is bigger than 9.11' }],
          toolCalls: [],
        },
        {
          role: MessageRole.system,
          content: [{ type: 'text', text: 'Expand your answer' }],
        },
        {
          role: MessageRole.assistant,
          content: [
            {
              type: 'text',
              text: "Sure, let's break it down step by step to understand why 9.9 is greater than 9.11",
            },
          ],
          toolCalls: [],
        },
      ],
      tokenUsage: {
        promptTokens: 114,
        completionTokens: 352,
        totalTokens: 466,
      },
      finishReason: 'stop',
    },
  },
]

export const CHUNKS = CHUNK_EVENTS.map((event) => {
  return `event: ${event.event}
data: ${JSON.stringify(event.data)}
`
})

const lastResponse = [...CHUNK_EVENTS]
  .reverse()
  .find((e) => e.data.type === ChainEventTypes.ProviderCompleted)!
  .data as LatitudeProviderCompletedEventData
export const FINAL_RESPONSE = {
  uuid: lastResponse.uuid,
  conversation: lastResponse.messages,
  response: lastResponse.response,
}
