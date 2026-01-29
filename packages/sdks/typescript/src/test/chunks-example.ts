import {
  ChainEvent,
  ChainEventTypes,
  LatitudeProviderCompletedEventData,
  StreamEventTypes,
} from '@latitude-data/constants'
import { MessageRole } from '@latitude-data/constants/legacyCompiler'

const CHUNK_EVENTS: ChainEvent[] = [
  {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.ChainStarted,
      timestamp: 965044800000,
      uuid: '123',
      messages: [],
    },
  },
  {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.StepStarted,
      timestamp: 965044800000,
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
      timestamp: 965044800000,
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
      timestamp: 965044800000,
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
        inputTokens: 19,
        outputTokens: 84,
        promptTokens: 19,
        completionTokens: 84,
        totalTokens: 103,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      },
      finishReason: 'stop',
      response: {
        streamType: 'text',
        text: '9.9 is bigger than 9.11',
        usage: {
          inputTokens: 19,
          outputTokens: 84,
          promptTokens: 19,
          completionTokens: 84,
          totalTokens: 103,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        },
        toolCalls: [],
      },
    },
  },
  {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.StepCompleted,
      timestamp: 965044800000,
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
      timestamp: 965044800000,
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
      timestamp: 965044800000,
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
      timestamp: 965044800000,
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
        inputTokens: 114,
        outputTokens: 352,
        promptTokens: 114,
        completionTokens: 352,
        totalTokens: 466,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      },
      finishReason: 'stop',
      response: {
        streamType: 'text',
        text: "Sure, let's break it down step by step to understand why 9.9 is greater than 9.11",
        usage: {
          inputTokens: 114,
          outputTokens: 352,
          promptTokens: 114,
          completionTokens: 352,
          totalTokens: 466,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        },
        toolCalls: [],
      },
    },
  },
  {
    event: StreamEventTypes.Latitude,
    data: {
      type: ChainEventTypes.StepCompleted,
      timestamp: 965044800000,
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
      timestamp: 965044800000,
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
      response: undefined,
      toolCalls: [],
      tokenUsage: {
        inputTokens: 114,
        outputTokens: 352,
        promptTokens: 114,
        completionTokens: 352,
        totalTokens: 466,
        reasoningTokens: 0,
        cachedInputTokens: 0,
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
