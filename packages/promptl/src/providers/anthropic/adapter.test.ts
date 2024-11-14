import { render } from '$promptl/compiler'
import { removeCommonIndent } from '$promptl/compiler/utils'
import { MessageRole } from '$promptl/types'
import { describe, expect, it } from 'vitest'

import { Adapters } from '..'

describe('Anthropic adapter', async () => {
  it('moves top system messages to config', async () => {
    const prompt = `Hello <system>World</system>`
    const { config, messages } = await render({
      prompt,
      adapter: Adapters.anthropic,
    })
    expect(messages).toEqual([])

    expect(config.system).toEqual([
      {
        type: 'text',
        text: 'Hello',
      },
      {
        type: 'text',
        text: 'World',
      },
    ])
  })

  it('adapts user messages', async () => {
    const prompt = removeCommonIndent(`
      <user>
        Hello world!
        <content-image>https://image.source/</content-image>
      </user>
    `)

    const { messages } = await render({ prompt, adapter: Adapters.anthropic })
    expect(messages).toEqual([
      {
        role: MessageRole.user,
        content: [
          { type: 'text', text: 'Hello world!' },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'https://image.source/',
            },
          },
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

    const { messages } = await render({ prompt, adapter: Adapters.anthropic })
    expect(messages).toEqual([
      {
        role: MessageRole.assistant,
        content: [
          { type: 'text', text: 'Hello world!' },
          {
            type: 'tool_use',
            id: '1234',
            name: 'get_weather',
            input: { location: 'Barcelona' },
          },
        ],
      },
    ])
  })

  it('adapts tool messages', async () => {
    const prompt = removeCommonIndent(`
      <tool id="1234">
        17ºC
      </tool>
    `)

    const { messages } = await render({ prompt, adapter: Adapters.anthropic })
    expect(messages).toEqual([
      {
        role: MessageRole.user,
        content: [
          {
            type: 'tool_result',
            tool_use_id: '1234',
            content: [{ type: 'text', text: '17ºC' }],
          },
        ],
      },
    ])
  })
})
