import {
  ParameterType,
  Providers,
  TraceContext,
} from '@latitude-data/constants'
import { Prompt, RenderToolCallDetails } from '@latitude-data/sdk'

export const PROMPT: Prompt = {
  versionUuid: 'fake-version-uuid',
  uuid: 'fake-document-uuid',
  path: 'fake-document-path',
  content: `
---
provider: openai
model: gpt-4o
type: agent
temperature: 0.5
maxTokens: 1000
tools:
  - get_weather:
      description: Get the weather for a given location
      parameters:
        location:
          type: string
          description: The location to get the weather for
---   

<step>
    Think step by step about the user question:
    <user> {{ question }} </user>
</step>

<step>
  Think harder.
</step>

<step>
  Now think freely, remember, you are an agent.
</step>
`.trim(),
  contentHash: 'fake-document-hash',
  config: {
    provider: 'openai',
    model: 'gpt-4o',
    type: 'agent',
    temeperature: 0.5,
    maxTokens: 1000,
  },
  parameters: {
    question: {
      type: ParameterType.Text,
    },
  },
  provider: Providers.OpenAI,
}

export const PARAMETERS: Record<string, unknown> = {
  question: 'What is the weather in Barcelona?',
}

export const COMPLETIONS: Record<string, unknown>[] = [
  {
    role: 'assistant',
    content: 'The user asked for the weather.',
  },
  {
    role: 'assistant',
    content: 'The user has asked specifically for the weather in Barcelona.',
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: 'I need to know the weather in Barcelona. I will use the get_weather tool.',
      },
    ],
    tool_calls: [
      {
        id: 'fake-tool-call-id-1',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"location": "Barcelona"}',
        },
      },
    ],
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: 'The weather in Barcelona is sunny.',
      },
    ],
    tool_calls: [],
  },
]

export const TOOL = async (
  _arguments: Record<string, unknown>,
  _details: RenderToolCallDetails,
) => {
  return {
    weather: 'SUNNY',
    confidence: 0.95,
  }
}

export const RUN_RESPONSE = (trace: TraceContext) => ({
  uuid: 'fake-conversation-uuid-1',
  conversation: [
    {
      role: 'user',
      content: 'What is the weather in Barcelona?',
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'I need to know the weather in Barcelona. I will use the get_weather tool.',
        },
      ],
      tool_calls: [
        {
          id: 'fake-tool-call-id-1',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "Barcelona"}',
          },
        },
      ],
    },
  ],
  response:
    'I need to know the weather in Barcelona. I will use the get_weather tool.',
  trace: trace,
})

export const CHAT_RESPONSES = [
  (trace: TraceContext) => ({
    uuid: 'fake-conversation-uuid-2',
    conversation: [
      {
        role: 'user',
        content: 'What is the weather in Barcelona?',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I need to know the weather in Barcelona. I will use the get_weather tool.',
          },
        ],
        tool_calls: [
          {
            id: 'fake-tool-call-id-1',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location": "Barcelona"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'fake-tool-call-id-1',
            toolName: 'get_weather',
            result: {
              weather: 'SUNNY',
              confidence: 0.95,
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
            text: 'I will do it again for Madrid.',
          },
        ],
        tool_calls: [
          {
            id: 'fake-tool-call-id-2',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location": "Madrid"}',
            },
          },
        ],
      },
    ],
    response: 'I will do it again for Madrid.',
    trace: trace,
  }),
  (trace: TraceContext) => ({
    uuid: 'fake-conversation-uuid-3',
    conversation: [
      {
        role: 'user',
        content: 'What is the weather in Barcelona?',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I need to know the weather in Barcelona. I will use the get_weather tool.',
          },
        ],
        tool_calls: [
          {
            id: 'fake-tool-call-id-1',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location": "Barcelona"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'fake-tool-call-id-1',
            toolName: 'get_weather',
            result: {
              weather: 'SUNNY',
              confidence: 0.95,
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
            text: 'I will do it again for Madrid.',
          },
        ],
        tool_calls: [
          {
            id: 'fake-tool-call-id-2',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location": "Madrid"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'fake-tool-call-id-2',
            toolName: 'get_weather',
            result: {
              weather: 'SUNNY',
              confidence: 0.95,
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
            text: 'Done!',
          },
        ],
      },
    ],
    response: 'Done!',
    trace: trace,
  }),
]
