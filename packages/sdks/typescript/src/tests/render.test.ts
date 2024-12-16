import { Adapters } from 'promptl-ai'
import { Latitude } from '$sdk/index'
import { Prompt } from '$sdk/utils/types'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const SIMPLE_PROMPT: Partial<Prompt> = {
  path: 'path/to/prompt',
  promptlVersion: 1,
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
  promptlVersion: 1,
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

let FAKE_LATITUDE_SDK_KEY = 'fake-api-key'
let sdk: Latitude

describe('render', () => {
  beforeAll(() => {
    sdk = new Latitude(FAKE_LATITUDE_SDK_KEY, {
      __internal: { retryMs: 10 },
    })
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
  })
})
