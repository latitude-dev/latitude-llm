import { render } from '$compiler/compiler'
import { removeCommonIndent } from '$compiler/compiler/utils'
import { describe, expect, it } from 'vitest'

import { serialize } from '.'

describe('serialize', async () => {
  it('serializes a simple system message', async () => {
    const prompt = removeCommonIndent(`
      <system>
        This is a test
      </system>
    `)

    const conversation = await render({
      prompt,
      parameters: {},
    })

    const serialized = serialize(conversation)
    expect(serialized).toBe(
      removeCommonIndent(`
      <system>
        This is a test
      </system>
    `),
    )
  })

  it('serializes a conversation with a config section', async () => {
    const prompt = removeCommonIndent(`
      ---
      foo: bar
      baz:
        - qux
        - quux
      ---
      <system>
        This is a test
      </system>
    `)

    const conversation = await render({
      prompt,
      parameters: {},
    })

    const serialized = serialize(conversation)
    expect(serialized).toBe(
      removeCommonIndent(`
      ---
      foo: bar
      baz:
        - qux
        - quux
      ---
      <system>
        This is a test
      </system>
    `),
    )
  })

  it('serializes a conversation with a config section and messages', async () => {
    const prompt = removeCommonIndent(`
      ---
      foo: bar
      baz:
        - qux
        - quux
      ---
      <system>
        This is a test
      </system>
      <user>
        User message
      </user>
      <assistant>
        Assistant message
      </assistant>
    `)

    const conversation = await render({
      prompt,
      parameters: {},
    })

    const serialized = serialize(conversation)
    expect(serialized).toBe(
      removeCommonIndent(`
      ---
      foo: bar
      baz:
        - qux
        - quux
      ---
      <system>
        This is a test
      </system>
      <user>
        User message
      </user>
      <assistant>
        Assistant message
      </assistant>
    `),
    )
  })

  it('serializes multiple message roles', async () => {
    const prompt = removeCommonIndent(`
      <system>
        This is a test
      </system>
      <user name="John Doe">
        User message
      </user>
      <assistant>
        Assistant message
      </assistant>
      <tool id="123">
        Tool message
      </tool>
    `)

    const conversation = await render({
      prompt,
      parameters: {},
    })

    const serialized = serialize(conversation)
    expect(serialized).toBe(
      removeCommonIndent(`
      <system>
        This is a test
      </system>
      <user name="John Doe">
        User message
      </user>
      <assistant>
        Assistant message
      </assistant>
      <tool id="123">
        Tool message
      </tool>
    `),
    )
  })

  it('serializes a conversation with multiple user messages', async () => {
    const prompt = removeCommonIndent(`
      <system>
        This is a test
      </system>
      <user name="Anna">
        First user message
      </user>
      <user name="Bob">
        Second user message
      </user>
      <assistant>
        Assistant response
      </assistant>
    `)

    const conversation = await render({
      prompt,
      parameters: {},
    })

    const serialized = serialize(conversation)
    expect(serialized).toBe(
      removeCommonIndent(`
      <system>
        This is a test
      </system>
      <user name="Anna">
        First user message
      </user>
      <user name="Bob">
        Second user message
      </user>
      <assistant>
        Assistant response
      </assistant>
    `),
    )
  })

  it('serializes a conversation with parameters', async () => {
    const prompt = removeCommonIndent(`
      <system>
        This is a test
      </system>
      <user>
        User message with parameter {{param}}
      </user>
    `)

    const conversation = await render({
      prompt,
      parameters: { param: 'value' },
    })

    const serialized = serialize(conversation)
    expect(serialized).toBe(
      removeCommonIndent(`
      <system>
        This is a test
      </system>
      <user>
        User message with parameter value
      </user>
    `),
    )
  })
})
