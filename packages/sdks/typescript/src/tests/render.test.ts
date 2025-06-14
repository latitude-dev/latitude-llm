import { Latitude } from '$sdk/index'
import { Prompt } from '$sdk/utils/types'
import { AGENT_RETURN_TOOL_NAME } from '@latitude-data/constants'
import { Adapters } from 'promptl-ai'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MockInstrumentation } from './helpers/mockTools/instrumentation'

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

    it('handles requested tools', async () => {
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

      expect(get_weather).toHaveBeenCalledTimes(1)
      expect(get_weather).toHaveBeenCalledWith(
        {
          location: 'Paris',
        },
        expect.any(Object),
      )
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
      expect(instrumentation.wrapRenderStep).toHaveBeenCalledTimes(2)
      expect(instrumentation.wrapRenderCompletion).toHaveBeenCalledTimes(2)
      expect(instrumentation.wrapRenderTool).toHaveBeenCalledTimes(1)
    })
  })

  describe('agent', () => {
    it('handles tools and executes autonomously until it returns a custom tool call', async () => {
      const prompt = {
        path: 'prompt/agent',
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
  - get_location:
      description: Returns the location of the user
---
What's the weather like in my location?
`,
      }

      const get_weather = vi.fn(async ({ location }) => ({
        location,
        temperature: 20,
        description: 'Sunny',
        humidity: 50,
      }))

      const get_location = vi.fn(async () => ({
        location: 'Paris',
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
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'get_location',
                  arguments: '{}',
                },
              },
            ],
          }
        }
        if (step === 2) {
          return {
            role: 'assistant',
            content: [],
            tool_calls: [
              {
                id: 'call_2',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"location":"Paris"}',
                },
              },
            ],
          }
        }
        return {
          role: 'assistant',
          content: [],
          tool_calls: [
            {
              id: 'call_3',
              type: 'function',
              function: {
                name: AGENT_RETURN_TOOL_NAME,
                arguments:
                  '{"response":"It is sunny in Paris with a temperature of 20°C and humidity of 50%."}',
              },
            },
          ],
        }
      })

      const { result } = await sdk.prompts.renderAgent({
        prompt: prompt as Prompt,
        parameters: {
          location: 'Paris',
        },
        onStep,
        tools: {
          get_weather,
          get_location,
        },
      })

      expect(get_weather).toHaveBeenCalledTimes(1)
      expect(get_weather).toHaveBeenCalledWith(
        { location: 'Paris' },
        expect.any(Object),
      )

      expect(get_location).toHaveBeenCalledTimes(1)
      expect(get_location).toHaveBeenCalledWith({}, expect.any(Object))

      expect(onStep).toHaveBeenCalledTimes(3)

      expect(result).toEqual({
        response:
          'It is sunny in Paris with a temperature of 20°C and humidity of 50%.',
      })
    })

    it('handles instrumentation', async () => {
      const prompt = {
        path: 'prompt/agent',
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
  - get_location:
      description: Returns the location of the user
---
What's the weather like in my location?
`,
      }

      const get_weather = vi.fn(async ({ location }) => ({
        location,
        temperature: 20,
        description: 'Sunny',
        humidity: 50,
      }))

      const get_location = vi.fn(async () => ({
        location: 'Paris',
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
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'get_location',
                  arguments: '{}',
                },
              },
            ],
          }
        }
        if (step === 2) {
          return {
            role: 'assistant',
            content: [],
            tool_calls: [
              {
                id: 'call_2',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"location":"Paris"}',
                },
              },
            ],
          }
        }
        return {
          role: 'assistant',
          content: [],
          tool_calls: [
            {
              id: 'call_3',
              type: 'function',
              function: {
                name: AGENT_RETURN_TOOL_NAME,
                arguments:
                  '{"response":"It is sunny in Paris with a temperature of 20°C and humidity of 50%."}',
              },
            },
          ],
        }
      })

      const instrumentation = new MockInstrumentation()
      Latitude.instrument(instrumentation)

      const { result } = await sdk.prompts.renderAgent({
        prompt: prompt as Prompt,
        parameters: {
          location: 'Paris',
        },
        onStep,
        tools: {
          get_weather,
          get_location,
        },
      })

      expect(get_weather).toHaveBeenCalledExactlyOnceWith(
        { location: 'Paris' },
        expect.any(Object),
      )
      expect(get_location).toHaveBeenCalledExactlyOnceWith(
        {},
        expect.any(Object),
      )
      expect(onStep).toHaveBeenCalledTimes(3)
      expect(result).toEqual({
        response:
          'It is sunny in Paris with a temperature of 20°C and humidity of 50%.',
      })
      expect(instrumentation.wrapRenderAgent).toHaveBeenCalledTimes(1)
      expect(instrumentation.wrapRenderStep).toHaveBeenCalledTimes(3)
      expect(instrumentation.wrapRenderCompletion).toHaveBeenCalledTimes(3)
      expect(instrumentation.wrapRenderTool).toHaveBeenCalledTimes(3)
    })
  })
})
