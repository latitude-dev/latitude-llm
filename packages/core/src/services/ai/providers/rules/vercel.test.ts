import type { Message } from '@latitude-data/constants/legacyCompiler'
import { describe, expect, it } from 'vitest'

import { Providers } from '@latitude-data/constants'
import { AppliedRules } from './types'
import { vercelSdkRules } from './vercel'

let messages: Message[]
const config = {} as AppliedRules['config']

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

  describe('filterEmptyMessages', () => {
    it('keeps non-assistant messages regardless of content', () => {
      messages = [
        {
          role: 'system',
          content: [{ type: 'text', text: '' }],
        },
        {
          role: 'user',
          content: '',
        },
        {
          role: 'tool',
          content: '',
          toolId: '1',
          toolName: 'test',
        },
      ] as Message[]

      const rules = vercelSdkRules(
        { rules: [], messages, config },
        Providers.Anthropic,
      )

      expect(rules.messages).toHaveLength(3)
      expect(rules.messages.map((m) => m.role)).toEqual([
        'system',
        'user',
        'tool',
      ])
    })

    it('keeps assistant messages with non-empty string content', () => {
      messages = [
        {
          role: 'system',
          content: [{ type: 'text', text: '' }],
        },
        {
          role: 'user',
          content: '',
        },
        {
          role: 'assistant',
          content: 'Hello there!',
        },
        {
          role: 'assistant',
          content: '   ',
        },
      ] as Message[]

      const rules = vercelSdkRules(
        { rules: [], messages, config },
        Providers.Anthropic,
      )

      expect(rules.messages).toHaveLength(4)
      expect(rules.messages[2].content).toEqual([
        { type: 'text', text: 'Hello there!' },
      ])
      expect(rules.messages[3].content).toEqual([{ type: 'text', text: '   ' }])
    })

    it('filters assistant messages with empty string content', () => {
      messages = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
        {
          role: 'assistant',
          content: '',
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Are you there?' }],
        },
      ] as Message[]

      const rules = vercelSdkRules(
        { rules: [], messages, config },
        Providers.Anthropic,
      )

      expect(rules.messages).toHaveLength(2)
      expect(rules.messages.map((m) => m.role)).toEqual(['user', 'user'])
    })

    it('keeps assistant messages with non-empty array content', () => {
      messages = [
        {
          role: 'system',
          content: [{ type: 'text', text: '' }],
        },
        {
          role: 'user',
          content: '',
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'How are you?' },
          ],
        },
      ] as Message[]

      const rules = vercelSdkRules(
        { rules: [], messages, config },
        Providers.Anthropic,
      )

      expect(rules.messages).toHaveLength(3)
      expect(rules.messages[2].content).toEqual([
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'How are you?' },
      ])
    })

    it('filters assistant messages with completely empty array content', () => {
      messages = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
        {
          role: 'assistant',
          content: [],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Still there?' }],
        },
      ] as Message[]

      const rules = vercelSdkRules(
        { rules: [], messages, config },
        Providers.Anthropic,
      )

      expect(rules.messages).toHaveLength(2)
      expect(rules.messages.map((m) => m.role)).toEqual(['user', 'user'])
    })

    it('filters assistant messages with only empty text content parts', () => {
      messages = [
        {
          role: 'system',
          content: [{ type: 'text', text: '' }],
        },
        {
          role: 'user',
          content: '',
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: '' },
            { type: 'text', text: '' },
          ],
        },
      ] as Message[]

      const rules = vercelSdkRules(
        { rules: [], messages, config },
        Providers.Anthropic,
      )

      expect(rules.messages).toHaveLength(2)
      expect(rules.messages.map((m) => m.role)).toEqual(['system', 'user'])
    })

    it('keeps assistant messages with mixed empty and non-empty content parts', () => {
      messages = [
        {
          role: 'system',
          content: [{ type: 'text', text: '' }],
        },
        {
          role: 'user',
          content: '',
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: '' },
            { type: 'text', text: 'Hello' },
            { type: 'text', text: '' },
          ],
        },
      ] as Message[]

      const rules = vercelSdkRules(
        { rules: [], messages, config },
        Providers.Anthropic,
      )

      expect(rules.messages).toHaveLength(3)
      expect(rules.messages[2].content).toEqual([
        { type: 'text', text: 'Hello' },
      ])
    })

    it('keeps assistant messages with toolCalls even if content is empty', () => {
      messages = [
        {
          role: 'system',
          content: [{ type: 'text', text: '' }],
        },
        {
          role: 'user',
          content: '',
        },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call_123',
              name: 'search',
              arguments: { query: 'test' },
            },
          ],
        },
        {
          role: 'assistant',
          content: [],
          toolCalls: [
            {
              id: 'call_456',
              name: 'calculate',
              arguments: { expression: '2+2' },
            },
          ],
        },
      ] as Message[]

      const rules = vercelSdkRules(
        { rules: [], messages, config },
        Providers.Anthropic,
      )

      expect(rules.messages).toHaveLength(4)
      expect(rules.messages[2].toolCalls).toEqual([
        {
          id: 'call_123',
          name: 'search',
          arguments: { query: 'test' },
        },
      ])
      expect(rules.messages[3].toolCalls).toEqual([
        {
          id: 'call_456',
          name: 'calculate',
          arguments: { expression: '2+2' },
        },
      ])
    })

    it('filters assistant messages with empty toolCalls array and empty content', () => {
      messages = [
        {
          role: 'system',
          content: [{ type: 'text', text: '' }],
        },
        {
          role: 'user',
          content: '',
        },
        {
          role: 'assistant',
          content: '',
          toolCalls: [],
        },
        {
          role: 'assistant',
          content: [],
          toolCalls: [],
        },
      ] as Message[]

      const rules = vercelSdkRules(
        { rules: [], messages, config },
        Providers.Anthropic,
      )

      expect(rules.messages).toHaveLength(2)
      expect(rules.messages.map((m) => m.role)).toEqual(['system', 'user'])
    })

    it('keeps non-text content types in assistant messages', () => {
      messages = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: '123',
              toolName: 'search',
              args: { query: 'test' },
            },
          ],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'file',
              file: 'file content',
              mimeType: 'text/plain',
            },
          ],
        },
      ] as Message[]

      const rules = vercelSdkRules(
        { rules: [], messages, config },
        Providers.Anthropic,
      )

      expect(rules.messages).toHaveLength(2)
      expect(
        Array.isArray(rules.messages[0].content) &&
          rules.messages[0].content[0].type,
      ).toBe('tool-call')
      expect(
        Array.isArray(rules.messages[1].content) &&
          rules.messages[1].content[0].type,
      ).toBe('file')
    })

    it('handles complex conversation with multiple empty assistant messages', () => {
      messages = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
        {
          role: 'assistant',
          content: '',
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Are you there?' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: '' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Yes, I am here!' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Great!' }],
        },
        {
          role: 'assistant',
          content: [],
        },
      ] as Message[]

      const rules = vercelSdkRules(
        { rules: [], messages, config },
        Providers.Anthropic,
      )

      expect(rules.messages).toHaveLength(4)
      expect(rules.messages.map((m) => m.role)).toEqual([
        'user',
        'user',
        'assistant',
        'user',
      ])
      expect(rules.messages[2].content).toEqual([
        { type: 'text', text: 'Yes, I am here!' },
      ])
    })

    it('preserves message order after filtering empty assistant messages', () => {
      messages = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'First message' }],
        },
        {
          role: 'assistant',
          content: '',
        },
        {
          role: 'system',
          content: [{ type: 'text', text: 'System message' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Valid assistant message' }],
        },
        {
          role: 'assistant',
          content: [],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Last message' }],
        },
      ] as Message[]

      const rules = vercelSdkRules(
        { rules: [], messages, config },
        Providers.Anthropic,
      )

      expect(rules.messages).toHaveLength(4)
      expect(rules.messages.map((m) => m.role)).toEqual([
        'user',
        'system',
        'assistant',
        'user',
      ])

      // Verify content to ensure order is preserved
      expect(
        Array.isArray(rules.messages[0].content)
          ? (rules.messages[0].content[0] as { text: string }).text
          : rules.messages[0].content,
      ).toBe('First message')
      expect(
        Array.isArray(rules.messages[2].content)
          ? (rules.messages[2].content[0] as { text: string }).text
          : rules.messages[2].content,
      ).toBe('Valid assistant message')
      expect(
        Array.isArray(rules.messages[3].content)
          ? (rules.messages[3].content[0] as { text: string }).text
          : rules.messages[3].content,
      ).toBe('Last message')
    })

    it('handles assistant messages that become empty after content filtering', () => {
      messages = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: '' },
            { type: 'text', text: '   ' },
            { type: 'text', text: '' },
          ],
        },
      ] as Message[]

      const rules = vercelSdkRules(
        { rules: [], messages, config },
        Providers.Anthropic,
      )

      // The message should be kept because it has whitespace content
      expect(rules.messages).toHaveLength(1)
      expect(rules.messages[0].content).toEqual([{ type: 'text', text: '   ' }])
    })

    it('filters assistant messages with mixed content where all text parts are empty', () => {
      messages = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: '' },
            {
              type: 'tool-call',
              toolCallId: '123',
              toolName: 'search',
              args: {},
            },
            { type: 'text', text: '' },
          ],
        },
      ] as Message[]

      const rules = vercelSdkRules(
        { rules: [], messages, config },
        Providers.Anthropic,
      )

      // Should be kept because it has non-text content
      expect(rules.messages).toHaveLength(1)
      expect(rules.messages[0].content).toHaveLength(1)
      expect(
        Array.isArray(rules.messages[0].content) &&
          rules.messages[0].content[0].type,
      ).toBe('tool-call')
    })

    it('handles edge case with null or undefined content parts', () => {
      messages = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: null },
            { type: 'text', text: undefined },
            { type: 'text', text: 'Valid content' },
          ],
        },
      ] as Message[]

      const rules = vercelSdkRules(
        { rules: [], messages, config },
        Providers.Anthropic,
      )

      // Should keep the message but filter out null/undefined text parts
      expect(rules.messages).toHaveLength(1)
      expect(rules.messages[0].content).toEqual([
        { type: 'text', text: 'Valid content' },
      ])
    })
  })
})
