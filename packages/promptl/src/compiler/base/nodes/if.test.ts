import { AssistantMessage, MessageRole, UserMessage } from '$compiler/types'
import { describe, expect, it, vi } from 'vitest'

import { render } from '../..'
import { removeCommonIndent } from '../../utils'

describe('conditional expressions', async () => {
  it('only evaluates the content inside the correct branch', async () => {
    const prompt = `
      {{ if foo }}
        {{ whenTrue() }}
      {{ else }}
        {{ whenFalse() }}
      {{ endif }}
    `
    const whenTrue = vi.fn()
    const whenFalse = vi.fn()

    await render({
      prompt: removeCommonIndent(prompt),
      parameters: {
        foo: true,
        whenTrue,
        whenFalse,
      },
    })

    expect(whenTrue).toHaveBeenCalled()
    expect(whenFalse).not.toHaveBeenCalled()

    whenTrue.mockClear()
    whenFalse.mockClear()

    await render({
      prompt: removeCommonIndent(prompt),
      parameters: {
        foo: false,
        whenTrue,
        whenFalse,
      },
    })

    expect(whenTrue).not.toHaveBeenCalled()
    expect(whenFalse).toHaveBeenCalled()
  })

  it('adds messages conditionally', async () => {
    const prompt = `
      {{ if foo }}
        <user>Foo!</user>
      {{ else }}
        <assistant>Bar!</assistant>
      {{ endif }}
    `
    const result1 = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {
        foo: true,
      },
    })
    const result2 = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {
        foo: false,
      },
    })

    expect(result1.messages.length).toBe(1)
    const message1 = result1.messages[0]! as UserMessage
    expect(message1.role).toBe('user')
    expect(message1.content.length).toBe(1)
    expect(message1.content[0]!.type).toBe('text')
    expect(message1.content).toEqual([{ type: 'text', text: 'Foo!' }])

    expect(result2.messages.length).toBe(1)
    const message2 = result2.messages[0]! as AssistantMessage
    expect(message2.role).toBe('assistant')
    expect(message2.content).toEqual([{ type: 'text', text: 'Bar!' }])
  })

  it('adds message contents conditionally', async () => {
    const prompt = `
      <user>
        {{ if foo }}
          Foo!
        {{ else }}
          Bar!
        {{ endif }}
      </user>
    `

    const result1 = await render({
      prompt: removeCommonIndent(prompt),
      parameters: { foo: true },
    })
    const result2 = await render({
      prompt: removeCommonIndent(prompt),
      parameters: { foo: false },
    })

    expect(result1.messages).toEqual([
      {
        role: MessageRole.user,
        name: undefined,
        content: [
          {
            type: 'text',
            text: 'Foo!',
          },
        ],
      },
    ])
    expect(result2.messages).toEqual([
      {
        role: MessageRole.user,
        name: undefined,
        content: [
          {
            type: 'text',
            text: 'Bar!',
          },
        ],
      },
    ])
  })
})
