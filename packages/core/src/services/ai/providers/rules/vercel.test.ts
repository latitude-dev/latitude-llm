import type { Message } from '@latitude-data/compiler'
import { describe, expect, it } from 'vitest'

import { Providers } from '../models'
import { vercelSdkRules } from './vercel'
import { AppliedRules } from './types'

let messages: Message[]
let config = {} as AppliedRules['config']

describe('applyVercelSdkRules', () => {
  it('modify plain text messages to object', () => {
    messages = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
      {
        role: 'assistant',
        content: 'Hello! How are you?',
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'I am good' }],
      },
    ] as Message[]

    const rules = vercelSdkRules(
      { rules: [], messages, config },
      Providers.Anthropic,
    )

    expect(rules.messages).toEqual([
      ...(messages.slice(0, 1) as Message[]),
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello! How are you?' }],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'I am good' }],
      },
    ])
  })

  it('put each system message part in a system message and set custom attributes there', () => {
    messages = [
      {
        role: 'system',
        content: [
          { type: 'text', text: 'I am a' },
          { type: 'text', text: 'system message' },
        ],
      },
    ] as Message[]

    const rules = vercelSdkRules(
      { rules: [], messages, config },
      Providers.Anthropic,
    )
    expect(rules.messages).toEqual([
      { role: 'system', content: 'I am a' },
      { role: 'system', content: 'system message' },
    ])
  })

  it('already flattened messages', () => {
    messages = [
      { role: 'system', content: 'I am a' },
      { role: 'system', content: 'system message' },
    ] as unknown as Message[]

    const rules = vercelSdkRules(
      { rules: [], messages, config },
      Providers.Anthropic,
    )
    expect(rules.messages).toEqual([
      { role: 'system', content: 'I am a' },
      { role: 'system', content: 'system message' },
    ])
  })

  it('put root system message metadata into text parts', () => {
    messages = [
      {
        role: 'system',
        cache_control: { type: 'ephemeral' },
        content: [
          { type: 'text', text: 'I am a' },
          { type: 'text', text: 'system message' },
        ],
      },
    ] as Message[]

    const rules = vercelSdkRules(
      { rules: [], messages, config },
      Providers.Anthropic,
    )
    expect(rules.messages).toEqual([
      {
        role: 'system',
        content: 'I am a',
        providerOptions: {
          anthropic: {
            cacheControl: { type: 'ephemeral' },
          },
        },
      },
      {
        role: 'system',
        content: 'system message',
        providerOptions: {
          anthropic: {
            cacheControl: { type: 'ephemeral' },
          },
        },
      },
    ])
  })

  it('put root user message metadata into text parts', () => {
    messages = [
      {
        role: 'user',
        cache_control: { type: 'ephemeral' },
        content: [
          { type: 'text', text: 'I am a' },
          { type: 'text', text: 'system message' },
        ],
      },
    ] as Message[]

    const rules = vercelSdkRules(
      { rules: [], messages, config },
      Providers.Anthropic,
    )
    expect(rules.messages).toEqual([
      {
        role: 'user',
        providerOptions: {
          anthropic: {
            cacheControl: { type: 'ephemeral' },
          },
        },
        content: [
          {
            type: 'text',
            text: 'I am a',
            providerOptions: {
              anthropic: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
          {
            type: 'text',
            text: 'system message',
            providerOptions: {
              anthropic: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
        ],
      },
    ])
  })

  it('transform message attributes into provider metadata', () => {
    messages = [
      {
        role: 'user',
        name: 'paco',
        content: [{ type: 'text', text: 'Hello' }],
        some_attribute: 'some_user_value',
        another_attribute: { another_user: 'value' },
      },
      {
        role: 'assistant',
        content: 'Hello! How are you?',
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'I am good' }],
        some_attribute: 'some_assistant_value',
        another_attribute: { another_assistant: 'value' },
      },
      {
        role: 'system',
        content: [{ type: 'text', text: 'I am good' }],
        some_attribute: 'some_system_value',
        cache_control: { type: 'ephemeral' },
        another_attribute: { another_system: 'value' },
      },
    ] as Message[]

    const rules = vercelSdkRules(
      { rules: [], messages, config },
      Providers.Anthropic,
    )
    const transformedMessages = rules.messages
    expect(transformedMessages).toEqual([
      {
        role: 'user',
        name: 'paco',
        content: [
          {
            type: 'text',
            text: 'Hello',
            providerOptions: {
              anthropic: {
                someAttribute: 'some_user_value',
                anotherAttribute: { anotherUser: 'value' },
              },
            },
          },
        ],
        providerOptions: {
          anthropic: {
            someAttribute: 'some_user_value',
            anotherAttribute: { anotherUser: 'value' },
          },
        },
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello! How are you?' }],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I am good',
            providerOptions: {
              anthropic: {
                someAttribute: 'some_assistant_value',
                anotherAttribute: { anotherAssistant: 'value' },
              },
            },
          },
        ],
        providerOptions: {
          anthropic: {
            someAttribute: 'some_assistant_value',
            anotherAttribute: { anotherAssistant: 'value' },
          },
        },
      },
      {
        role: 'system',
        content: 'I am good',
        providerOptions: {
          anthropic: {
            someAttribute: 'some_system_value',
            cacheControl: { type: 'ephemeral' },
            anotherAttribute: { anotherSystem: 'value' },
          },
        },
      },
    ])
  })

  it('transform message content attributes into content provider metadata', () => {
    messages = [
      {
        role: 'user',
        name: 'paco',
        content: [
          {
            type: 'text',
            text: 'Hello',
            some_attribute: 'some_user_value',
            another_attribute: { another_user: 'value' },
          },
        ],
      },
      {
        role: 'assistant',
        content: 'Hello! How are you?',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I am good',
            some_attribute: 'some_assistant_value',
            another_attribute: { another_assistant: 'value' },
          },
        ],
      },
    ] as Message[]

    const rules = vercelSdkRules(
      { rules: [], messages, config },
      Providers.Anthropic,
    )
    const transformedMessages = rules.messages
    expect(transformedMessages).toEqual([
      {
        role: 'user',
        name: 'paco',
        content: [
          {
            type: 'text',
            text: 'Hello',
            providerOptions: {
              anthropic: {
                someAttribute: 'some_user_value',
                anotherAttribute: { anotherUser: 'value' },
              },
            },
          },
        ],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello! How are you?' }],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'I am good',
            providerOptions: {
              anthropic: {
                someAttribute: 'some_assistant_value',
                anotherAttribute: { anotherAssistant: 'value' },
              },
            },
          },
        ],
      },
    ])
  })

  it('adapts file content fields to file part fields', () => {
    messages = [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            file: 'pdf file content',
            mimeType: 'application/pdf',
          },
        ],
      },
    ] as Message[]

    const rules = vercelSdkRules(
      { rules: [], messages, config },
      Providers.Anthropic,
    )

    expect(rules.messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: 'pdf file content',
            mimeType: 'application/pdf',
          },
        ],
      },
    ])
  })

  it('adapts new tool call content fields to tool call part fields', () => {
    messages = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: '123',
            toolName: 'toolName',
            toolArguments: {
              arg1: 'value1',
              arg2: 'value2',
            },
          },
        ],
      },
    ] as unknown as Message[]

    const rules = vercelSdkRules(
      { rules: [], messages, config },
      Providers.Anthropic,
    )

    expect(rules.messages).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: '123',
            toolName: 'toolName',
            args: {
              arg1: 'value1',
              arg2: 'value2',
            },
          },
        ],
      },
    ])
  })

  it('adapts legacy tool call content fields to tool call part fields', () => {
    messages = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: '123',
            toolName: 'toolName',
            args: {
              arg1: 'value1',
              arg2: 'value2',
            },
          },
        ],
      },
    ] as unknown as Message[]

    const rules = vercelSdkRules(
      { rules: [], messages, config },
      Providers.Anthropic,
    )

    expect(rules.messages).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: '123',
            toolName: 'toolName',
            args: {
              arg1: 'value1',
              arg2: 'value2',
            },
          },
        ],
      },
    ])
  })

  it('always returns type and text for text content regardless of other props', () => {
    messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Hello',
            someRandomProp: 'value',
            anotherProp: { nested: 'value' },
            _promptlSourceMap: [{ start: 0, end: 5 }],
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Hi there',
            isReasoning: true,
            reasoning: 'Some reasoning',
          },
        ],
      },
    ] as Message[]

    const rules = vercelSdkRules(
      { rules: [], messages, config },
      Providers.Anthropic,
    )

    // Verify each text content only has type and text properties
    rules.messages.forEach((message) => {
      if (Array.isArray(message.content)) {
        message.content.forEach((content) => {
          if (content.type === 'text') {
            expect(Object.keys(content).sort()).not.toContain([
              'reasoning',
              'isReasoning',
            ])
          }
        })
      }
    })

    expect(rules.messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Hello',
            providerOptions: expect.any(Object),
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Hi there',
          },
        ],
      },
    ])
  })

  it('transform promptl tool messages into vercel tool messages', () => {
    messages = [
      {
        role: 'tool',
        content: [
          {
            type: 'text',
            text: 'The location Manolo is in the country of Spain.',
            _promptlSourceMap: [
              {
                start: 13,
                end: 19,
                identifier: 'location',
              },
            ],
          },
        ],
        toolId: '1',
        toolName: 'location-info',
      },
    ] as unknown as Message[]

    const rules = vercelSdkRules(
      { rules: [], messages, config },
      Providers.OpenAI,
    )

    expect(rules.messages).toEqual([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: '1',
            toolName: 'location-info',
            result: 'The location Manolo is in the country of Spain.',
          },
        ],
      },
    ])
  })
})
