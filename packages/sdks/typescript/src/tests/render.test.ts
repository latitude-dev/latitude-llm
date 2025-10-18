import { Latitude } from '$sdk/index'
import { Prompt } from '$sdk/utils/types'
import { Adapters } from 'promptl-ai'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MockInstrumentation } from './helpers/instrumentation'

const SIMPLE_PROMPT: Partial<Prompt> = {
  path: 'path/to/prompt',
  content: `
---
provider: openai
model: gpt-4o
maxTokens: 100
---

This is a custom prompt language

<user>
  Hi, my name is {{ name }}
</user>

<user>
  Wow, what a cool way to write prompts!
</user>
`,
}

const CHAIN_PROMPT: Partial<Prompt> = {
  path: 'path/to/chain',
  content: `
---
provider: openai
model: gpt-4o
maxTokens: 100
---

<step>
  This is a custom prompt language

  <user>
  Hi, my name is {{ name }}
  </user>
</step>

<step>
  <user>
    Wow, what a cool way to write prompts!
  </user>
</step>
`,
}

const FAKE_LATITUDE_SDK_KEY = 'fake-api-key'
let sdk: Latitude

describe('render', () => {
  beforeAll(() => {
    sdk = new Latitude(FAKE_LATITUDE_SDK_KEY, {
      __internal: { retryMs: 10 },
    })
  })

  afterEach(() => {
    Latitude.uninstrument()
  })

  describe('prompt', () => {
    it('returns the rendered messages from a prompt', async () => {
      const { messages } = await sdk.prompts.render({
        prompt: SIMPLE_PROMPT as Prompt,
        parameters: { name: 'John' },
      })

      expect(messages).toEqual([
        {
          role: 'system',
          content: 'This is a custom prompt language',
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hi, my name is John' }],
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Wow, what a cool way to write prompts!' },
          ],
        },
      ])
    })

    it('returns the configuration adapted to the provider', async () => {
      const { config } = await sdk.prompts.render({
        prompt: SIMPLE_PROMPT as Prompt,
        parameters: { name: 'John' },
        adapter: Adapters.openai,
      })

      expect(config).toEqual({
        provider: 'openai',
        model: 'gpt-4o',
        max_tokens: 100,
      })
    })

    it('adapts the config and message to anthropic', async () => {
      const { messages, config } = await sdk.prompts.render({
        prompt: SIMPLE_PROMPT as Prompt,
        parameters: { name: 'John' },
        adapter: Adapters.anthropic,
      })

      expect(messages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hi, my name is John' }],
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Wow, what a cool way to write prompts!' },
          ],
        },
      ])

      expect(config).toEqual({
        provider: 'openai', // Still the one defined in the prompt itself
        model: 'gpt-4o',
        max_tokens: 100,
        system: [{ type: 'text', text: 'This is a custom prompt language' }],
      })
    })

    it('adapts the config and message to openai responses', async () => {
      const { messages, config } = await sdk.prompts.render({
        prompt: {
          content: `
---
provider: openai
model: gpt-4o
maxTokens: 100
tools:
  - openai:
    - type: web_search_preview
      search_context_size: low

  - get_weather:
      description: Get the weather for a location
      parameters:
        type: object
        properties:
          location:
            type: string
            description: The location to get the weather for
---

This is a custom prompt language

<user>
  Hi, my name is {{ name }}
</user>

<user>
  Wow, what a cool way to write prompts!
</user>
`,
        },
        parameters: { name: 'John' },
        adapter: Adapters.openaiResponses,
      })

      expect(messages).toEqual([
        {
          type: 'message',
          role: 'system',
          content: [
            {
              text: 'This is a custom prompt language',
              type: 'input_text',
            },
          ],
        },
        {
          type: 'message',
          role: 'user',
          content: [
            {
              text: 'Hi, my name is John',
              type: 'input_text',
            },
          ],
        },
        {
          type: 'message',
          role: 'user',
          content: [
            {
              text: 'Wow, what a cool way to write prompts!',
              type: 'input_text',
            },
          ],
        },
      ])

      expect(config).toEqual({
        provider: 'openai', // Still the one defined in the prompt itself
        model: 'gpt-4o',
        max_tokens: 100,
        tools: [
          {
            name: 'get_weather',
            description: 'Get the weather for a location',
            type: 'function',
            parameters: {
              type: 'object',
              properties: {
                location: {
                  type: 'string',
                  description: 'The location to get the weather for',
                },
              },
            },
          },
          {
            type: 'web_search_preview',
            search_context_size: 'low',
          },
        ],
      })
    })
  })

  describe('chain', () => {
    it('runs the callback to generate a response after each step', async () => {
      let count = 0
      const onStep = vi.fn(async (_args) => {
        count++
        return `RESPONSE ${count}`
      })

      const { messages } = await sdk.prompts.renderChain({
        prompt: CHAIN_PROMPT as Prompt,
        parameters: { name: 'John' },
        onStep: (_args) => onStep(_args),
      })

      expect(onStep).toHaveBeenCalledTimes(2)
      expect(onStep).toHaveBeenCalledWith({
        config: {
          provider: 'openai',
          model: 'gpt-4o',
          max_tokens: 100,
        },
        messages: [
          {
            role: 'system',
            content: 'This is a custom prompt language',
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hi, my name is John' }],
          },
        ],
      })

      expect(messages).toEqual([
        {
          role: 'system',
          content: 'This is a custom prompt language',
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hi, my name is John' }],
          name: undefined,
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'RESPONSE 1' }],
          tool_calls: undefined,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Wow, what a cool way to write prompts!' },
          ],
          name: undefined,
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'RESPONSE 2' }],
          tool_calls: undefined,
        },
      ])
    })

    it('automatically runs tool handlers when the response contains a tool call request', async () => {
      const getWeatherTool = vi.fn(
        async (args: Record<string, unknown>) =>
          `The weather in ${args.location as string} is sunny and 25°C`,
      )

      const searchTool = vi.fn(
        async (args: Record<string, unknown>) =>
          `Search results for "${args.query as string}": Found 5 relevant articles`,
      )

      const onStep = vi.fn(async (args) => {
        // Simulate a response that contains tool calls
        if (args.messages.length === 2) {
          // First step - return a tool call
          return {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Let me check the weather for you.' },
              {
                type: 'tool-call',
                toolCallId: 'weather_1',
                toolName: 'get_weather',
                toolArguments: { location: 'Barcelona' },
              },
            ],
          }
        } else {
          // Second step - return another tool call
          return {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Now let me search for more information.' },
              {
                type: 'tool-call',
                toolCallId: 'search_1',
                toolName: 'search',
                toolArguments: { query: 'Barcelona weather' },
              },
            ],
          }
        }
      })

      const { messages } = await sdk.prompts.renderChain({
        prompt: CHAIN_PROMPT as Prompt,
        parameters: { name: 'John' },
        onStep,
        tools: {
          get_weather: getWeatherTool,
          search: searchTool,
        },
        adapter: Adapters.default,
      })

      // Verify onStep was called twice
      expect(onStep).toHaveBeenCalledTimes(2)

      // Verify tool handlers were called with correct arguments
      expect(getWeatherTool).toHaveBeenCalledWith(
        { location: 'Barcelona' },
        { id: 'weather_1', name: 'get_weather' },
      )
      expect(searchTool).toHaveBeenCalledWith(
        { query: 'Barcelona weather' },
        { id: 'search_1', name: 'search' },
      )

      // Verify the final messages include tool responses
      expect(messages).toEqual([
        {
          role: 'system',
          content: [{ type: 'text', text: 'This is a custom prompt language' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hi, my name is John' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Let me check the weather for you.',
            },
            {
              type: 'tool-call',
              toolCallId: 'weather_1',
              toolName: 'get_weather',
              toolArguments: {
                location: 'Barcelona',
              },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'text',
              text: '"The weather in Barcelona is sunny and 25°C"',
            },
          ],
          toolId: 'weather_1',
          toolName: 'get_weather',
          isError: false,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Wow, what a cool way to write prompts!' },
          ],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Now let me search for more information.',
            },
            {
              type: 'tool-call',
              toolCallId: 'search_1',
              toolName: 'search',
              toolArguments: {
                query: 'Barcelona weather',
              },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'text',
              text: '"Search results for \\"Barcelona weather\\": Found 5 relevant articles"',
            },
          ],
          toolId: 'search_1',
          toolName: 'search',
          isError: false,
        },
      ])
    })

    it('handles instrumentation', async () => {
      const prompt = {
        path: 'prompt/with/tools',
        content: `
---
provider: openai
model: gpt-4o
tools:
  - get_weather:
      description: Get the weather for a location
      parameters:
        location:
          type: string
          description: The location to get the weather for
---
<step>
  Request the weather for {{ location }}
</step>
<step>
  Now, return a detailed report about the weather to the user.
</step>
`,
      }
      const get_weather = vi.fn(async ({ location }) => ({
        location,
        temperature: 20,
        description: 'Sunny',
        humidity: 50,
      }))
      let step = 0
      const onStep = vi.fn(async (_args) => {
        step++
        if (step === 1) {
          return {
            role: 'assistant',
            content: [],
            tool_calls: [
              {
                id: 'call_12345xyz',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"location":"Paris"}',
                },
              },
            ],
          }
        }
        return `It is sunny in Paris with a temperature of 20°C and humidity of 50%.`
      })
      const instrumentation = new MockInstrumentation()
      Latitude.instrument(instrumentation)
      await sdk.prompts.renderChain({
        prompt: prompt as Prompt,
        parameters: {
          location: 'Paris',
        },
        onStep: (_args) => onStep(_args),
        tools: {
          get_weather,
        },
      })
      expect(get_weather).toHaveBeenCalledExactlyOnceWith(
        { location: 'Paris' },
        expect.any(Object),
      )
      expect(instrumentation.wrapRenderChain).toHaveBeenCalledTimes(1)
      expect(instrumentation.wrapRenderCompletion).toHaveBeenCalledTimes(2)
      expect(instrumentation.wrapRenderTool).toHaveBeenCalledTimes(1)
    })
  })
})
