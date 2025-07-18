import { ParameterType, Providers } from '@latitude-data/constants'
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

<step>
  Finally, answer the user question.
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
    content: 'The weather in Barcelona is sunny.',
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
