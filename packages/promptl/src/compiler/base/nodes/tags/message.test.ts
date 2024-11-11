import { render } from '$promptl/compiler'
import { removeCommonIndent } from '$promptl/compiler/utils'
import { CUSTOM_TAG_END, CUSTOM_TAG_START } from '$promptl/constants'
import CompileError from '$promptl/error/error'
import { getExpectedError } from '$promptl/test/helpers'
import {
  AssistantMessage,
  ImageContent,
  SystemMessage,
  TextContent,
  UserMessage,
} from '$promptl/types'
import { describe, expect, it } from 'vitest'

describe('messages', async () => {
  it('allows creating system, user, assistant', async () => {
    const prompt = `
      <system>system message</system>
      <user>user message</user>
      <assistant>assistant message</assistant>
    `
    const result = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {},
    })

    expect(result.messages.length).toBe(3)
    const systemMessage = result.messages[0]!
    const userMessage = result.messages[1]! as UserMessage
    const assistantMessage = result.messages[2]! as AssistantMessage

    expect(systemMessage.role).toBe('system')
    expect(systemMessage.content).toEqual([
      {
        type: 'text',
        text: 'system message',
      },
    ])

    expect(userMessage.role).toBe('user')
    expect((userMessage.content[0]! as TextContent).text).toBe('user message')

    expect(assistantMessage.role).toBe('assistant')
    expect(assistantMessage.content).toEqual([
      {
        type: 'text',
        text: 'assistant message',
      },
    ])
  })

  it('can create messages with the common message tag', async () => {
    const prompt = `
      <message role=${CUSTOM_TAG_START}role${CUSTOM_TAG_END}>message</message>
    `
    const result1 = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {
        role: 'system',
      },
    })
    const result2 = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {
        role: 'user',
      },
    })

    expect(result1.messages.length).toBe(1)
    const message1 = result1.messages[0]!
    expect(message1.role).toBe('system')
    expect(message1.content).toEqual([{ type: 'text', text: 'message' }])

    expect(result2.messages.length).toBe(1)
    const message2 = result2.messages[0]!
    expect(message2.role).toBe('user')
    expect((message2.content[0] as TextContent)!.text).toBe('message')
  })

  it('raises an error when using an invalid message role', async () => {
    const prompt = `
      <message role="foo">message</message>
    `
    const action = () =>
      render({
        prompt: removeCommonIndent(prompt),
        parameters: {},
      })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('invalid-message-role')
  })

  it('throws an error when a message tag is inside another message', async () => {
    const prompt = `
      <system>
        <user>user message</user>
      </system>
    `
    const action = () =>
      render({
        prompt: removeCommonIndent(prompt),
        parameters: {},
      })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('message-tag-inside-message')
  })

  it('creates a system message when no message tag is present', async () => {
    const prompt = `
      Test message
      <user>user message</user>
    `
    const result = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {},
    })

    expect(result.messages.length).toBe(2)
    const systemMessage = result.messages[0]! as SystemMessage
    const userMessage = result.messages[1]! as UserMessage

    expect(systemMessage.role).toBe('system')
    expect(systemMessage.content).toEqual([
      {
        type: 'text',
        text: 'Test message',
      },
    ])

    expect(userMessage.role).toBe('user')
    expect((userMessage.content[0]! as TextContent).text).toBe('user message')
  })

  it('allows message tag to have extra attributes', async () => {
    const prompt = `
      <user foo="user_bar">User message</user>
      <assistant foo="assistant_bar">Assistant message</assistant>
      <system foo="system_bar">System message</system>
    `
    const result = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {},
    })

    expect(result.messages).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: 'User message' }],
        foo: 'user_bar',
        name: undefined,
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Assistant message',
          },
        ],
        foo: 'assistant_bar',
      },
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'System message',
          },
        ],
        foo: 'system_bar',
      },
    ])
  })
})

describe('message contents', async () => {
  it('all messages can have multiple content tags', async () => {
    const prompt = `
      <user>
        <content-text>text content</content-text>
        <content-image>image content</content-image>
        <content-text>another text content</content-text>
      </user>
    `
    const result = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {},
    })

    expect(result.messages.length).toBe(1)
    const message = result.messages[0]! as UserMessage
    expect(message.content.length).toBe(3)
    expect(message.content[0]!.type).toBe('text')
    expect((message.content[0]! as TextContent).text).toBe('text content')

    expect(message.content[1]!.type).toBe('image')
    expect((message.content[1]! as ImageContent).image).toBe('image content')

    expect(message.content[2]!.type).toBe('text')
    expect((message.content[2]! as TextContent).text).toBe(
      'another text content',
    )
  })

  it('creates a text content when no content tag is present', async () => {
    const prompt = `
      <system>
        Test message
      </system>
    `
    const result = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {},
    })

    expect(result.messages.length).toBe(1)
    const message = result.messages[0]!

    expect(message.content).toEqual([
      {
        type: 'text',
        text: 'Test message',
      },
    ])
  })

  it('allows content tag to have extra attributes', async () => {
    const prompt = `
      <user>
        <content-text cache_control={{ { type: 'ephimeral' } }}>
          Long text cached...
        </content-text>
        <content-text>Short text not cached</content-text>
      </user>
    `
    const result = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {},
    })
    expect(result.messages.length).toBe(1)
    const message = result.messages[0]!
    expect(message.content).toEqual([
      {
        type: 'text',
        text: 'Long text cached...',
        cache_control: { type: 'ephimeral' },
      },
      {
        type: 'text',
        text: 'Short text not cached',
      },
    ])
  })
})
