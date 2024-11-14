import { render } from '$promptl/compiler'
import { removeCommonIndent } from '$promptl/compiler/utils'
import { MessageRole } from '$promptl/types'
import { describe, expect, it } from 'vitest'

import { Adapters } from '..'
import { AssistantMessage as OpenAiAssistantMessage } from './types'

describe('OpenAI adapter', async () => {
  it('adapts system messages', async () => {
    const prompt = `Hello world!`
    const { messages } = await render({ prompt, adapter: Adapters.openai })
    expect(messages).toEqual([
      {
        role: MessageRole.system,
        content: 'Hello world!', // System messages are defined as a string in OpenAI
      },
    ])
  })

  it('adapts user messages', async () => {
    const prompt = removeCommonIndent(`
      <user name="Image master">
        Hello world!
        <content-image>https://image.source/</content-image>
      </user>
    `)

    const { messages } = await render({ prompt, adapter: Adapters.openai })
    expect(messages).toEqual([
      {
        role: MessageRole.user,
        name: 'Image master',
        content: [
          { type: 'text', text: 'Hello world!' },
          { type: 'image', image: 'https://image.source/' },
        ],
      },
    ])
  })

  it('adapts assistant messages', async () => {
    const prompt = removeCommonIndent(`
      <assistant>
        Hello world!
        <tool-call id="1234" name="get_weather" arguments={{ { location: "Barcelona" } }} />
      </assistant>
    `)

    const { messages } = await render({ prompt, adapter: Adapters.openai })
    expect(messages).toEqual([
      {
        role: MessageRole.assistant,
        content: [{ type: 'text', text: 'Hello world!' }],
        tool_calls: [
          {
            id: '1234',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: JSON.stringify({ location: 'Barcelona' }),
            },
          },
        ],
      },
    ])

    const promptWithoutToolCalls = removeCommonIndent(`
      <assistant>
        Hello world!
      </assistant>
    `)

    const { messages: messagesWithoutToolCalls } = await render({
      prompt: promptWithoutToolCalls,
      adapter: Adapters.openai,
    })

    expect(messagesWithoutToolCalls[0]!.role).toBe(MessageRole.assistant)
    expect(
      (messagesWithoutToolCalls[0] as OpenAiAssistantMessage).tool_calls,
    ).not.toBeDefined()
  })

  it('adapts tool messages', async () => {
    const prompt = removeCommonIndent(`
      <tool id="1234">
        17ºC
      </tool>
    `)

    const { messages } = await render({ prompt, adapter: Adapters.openai })
    expect(messages).toEqual([
      {
        role: MessageRole.tool,
        tool_call_id: '1234',
        content: [{ type: 'text', text: '17ºC' }],
      },
    ])
  })
})
