import type { Message } from '@latitude-data/compiler'
import { describe, expect, it } from 'vitest'

import { PartialConfig } from '../../helpers'
import { Providers } from '../models'
import { vercelSdkRules } from './vercel'

let messages: Message[]
let config = {} as PartialConfig

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
        experimental_providerMetadata: {
          anthropic: {
            cacheControl: { type: 'ephemeral' },
          },
        },
      },
      {
        role: 'system',
        content: 'system message',
        experimental_providerMetadata: {
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
        experimental_providerMetadata: {
          anthropic: {
            cacheControl: { type: 'ephemeral' },
          },
        },
        content: [
          {
            type: 'text',
            text: 'I am a',
            experimental_providerMetadata: {
              anthropic: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
          {
            type: 'text',
            text: 'system message',
            experimental_providerMetadata: {
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
            experimental_providerMetadata: {
              anthropic: {
                some_attribute: 'some_user_value',
                another_attribute: { another_user: 'value' },
              },
            },
          },
        ],
        experimental_providerMetadata: {
          anthropic: {
            some_attribute: 'some_user_value',
            another_attribute: { another_user: 'value' },
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
            experimental_providerMetadata: {
              anthropic: {
                some_attribute: 'some_assistant_value',
                another_attribute: { another_assistant: 'value' },
              },
            },
          },
        ],
        experimental_providerMetadata: {
          anthropic: {
            some_attribute: 'some_assistant_value',
            another_attribute: { another_assistant: 'value' },
          },
        },
      },
      {
        role: 'system',
        content: 'I am good',
        experimental_providerMetadata: {
          anthropic: {
            some_attribute: 'some_system_value',
            cacheControl: { type: 'ephemeral' },
            another_attribute: { another_system: 'value' },
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
            experimental_providerMetadata: {
              anthropic: {
                some_attribute: 'some_user_value',
                another_attribute: { another_user: 'value' },
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
            experimental_providerMetadata: {
              anthropic: {
                some_attribute: 'some_assistant_value',
                another_attribute: { another_assistant: 'value' },
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
