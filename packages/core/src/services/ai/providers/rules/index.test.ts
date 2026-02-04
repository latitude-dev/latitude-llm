import { Providers } from '@latitude-data/constants'
import {
  AssistantMessage,
  FileContent,
  ImageContent,
  Message,
  TextContent,
  ToolResultContent,
  ToolRequestContent,
} from '@latitude-data/constants/messages'
import { describe, expect, it } from 'vitest'
import { applyAllRules } from './index'

describe('rules', () => {
  it('add providerOptions to rules config', () => {
    expect(
      applyAllRules({
        providerType: Providers.Anthropic,
        messages: [],
        config: {
          model: 'claude-3-7-sonnet-latest',
          thinking: { type: 'enabled', budgetTokens: 1024 },
        },
      }),
    ).toEqual({
      rules: [
        {
          rule: 'anthropic',
          ruleMessage:
            'Only system messages are present. You at least need one <user>your message</user> or <assistant>your message</assistant> in Anthropic.',
        },
      ],
      messages: [],
      config: {
        model: 'claude-3-7-sonnet-latest',
        thinking: { type: 'enabled', budgetTokens: 1024 },
        providerOptions: {
          anthropic: {
            model: 'claude-3-7-sonnet-latest',
            thinking: { type: 'enabled', budgetTokens: 1024 },
          },
        },
      },
    })
  })

  it('camelCase all providerOptions', () => {
    expect(
      applyAllRules({
        providerType: Providers.OpenAI,
        messages: [],
        config: {
          model: 'gpt4-o',
          something_underscored: {
            type: 'enabled',
            things_to_do: [
              { thing_one: 'Thing one' },
              { thing_two: 'Thing two' },
            ],
          },
        },
      }),
    ).toEqual({
      rules: [],
      messages: [],
      config: {
        model: 'gpt4-o',
        something_underscored: {
          type: 'enabled',
          things_to_do: [
            { thing_one: 'Thing one' },
            { thing_two: 'Thing two' },
          ],
        },
        providerOptions: {
          openai: {
            model: 'gpt4-o',
            somethingUnderscored: {
              type: 'enabled',
              thingsToDo: [
                { thingOne: 'Thing one' },
                { thingTwo: 'Thing two' },
              ],
            },
          },
        },
      },
    })
  })
})

describe('message translation (Promptl to VercelAI)', () => {
  const defaultConfig = { model: 'gpt-4o' }

  describe('system messages', () => {
    it('joins multiple text parts with newline', () => {
      const messages: Message[] = [
        {
          role: 'system',
          content: [
            { type: 'text', text: 'part1' } as TextContent,
            { type: 'text', text: 'part2' } as TextContent,
          ],
        },
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      expect(result.messages[0]).toEqual({
        role: 'system',
        content: 'part1\npart2',
      })
    })
  })

  describe('user messages', () => {
    it('converts single text to string', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' } as TextContent],
        },
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      expect(result.messages[0]).toEqual({
        role: 'user',
        content: 'Hello',
      })
    })

    it('converts multiple parts to array', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' } as TextContent,
            {
              type: 'image',
              image: 'data:image/png;base64,xxx',
            } as ImageContent,
          ],
        },
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      expect(result.messages[0]).toEqual({
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'image', image: 'data:image/png;base64,xxx' },
        ],
      })
    })

    it('converts file message', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: 'blob',
              mimeType: 'application/pdf',
            } as FileContent,
          ],
        },
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      expect(result.messages[0]).toEqual({
        role: 'user',
        content: [{ type: 'file', data: 'blob', mediaType: 'application/pdf' }],
      })
    })
  })

  describe('assistant messages', () => {
    it('keeps string content as string', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Hello from assistant',
            },
          ],
          toolCalls: null,
        } as AssistantMessage,
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      expect(result.messages[0]).toEqual({
        role: 'assistant',
        content: 'Hello from assistant',
      })
    })

    it('converts text and file content', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'thinking' },
            {
              type: 'file',
              file: 'blob',
              mimeType: 'application/pdf',
            } as FileContent,
          ],
          toolCalls: null,
        } as AssistantMessage,
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      expect(result.messages[0]).toEqual({
        role: 'assistant',
        content: [
          { type: 'text', text: 'thinking' },
          { type: 'file', data: 'blob', mediaType: 'application/pdf' },
        ],
      })
    })

    it('converts reasoning content', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: 'Let me think...' },
            { type: 'text', text: 'The answer is 42' },
          ],
          toolCalls: null,
        } as AssistantMessage,
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      expect(result.messages[0]).toEqual({
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'Let me think...' },
          { type: 'text', text: 'The answer is 42' },
        ],
      })
    })

    it('converts redacted-reasoning to reasoning type without prefix', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            { type: 'redacted-reasoning', data: 'hidden' },
            { type: 'text', text: 'The answer' },
          ],
          toolCalls: null,
        } as AssistantMessage,
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      const content = result.messages[0]?.content as Array<{
        type: string
        text: string
      }>
      expect(content[0].type).toBe('reasoning')
      expect(content[0].text).toBe('hidden')
    })

    it('filters empty assistant messages', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: '',
            },
          ],
          toolCalls: null,
        } as AssistantMessage,
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      expect(result.messages.length).toBe(0)
    })
  })

  describe('tool calls', () => {
    it('converts tool-call in content', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: '123',
              toolName: 'search',
              args: { query: 'test' },
            } as ToolRequestContent,
          ],
          toolCalls: null,
        } as AssistantMessage,
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      expect(result.messages[0]).toEqual({
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: '123',
            toolName: 'search',
            input: { query: 'test' },
          },
        ],
      })
    })

    it('converts legacy toolCalls property', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Let me search' }],
          toolCalls: [{ id: '1', name: 'search', arguments: { query: 'hi' } }],
        } as AssistantMessage,
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      expect(result.messages[0]).toEqual({
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me search' },
          {
            type: 'tool-call',
            toolCallId: '1',
            toolName: 'search',
            input: { query: 'hi' },
          },
        ],
      })
    })

    it('deduplicates tool calls from content and toolCalls property', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will help you' },
            {
              type: 'tool-call',
              toolCallId: '1',
              toolName: 'search',
              args: { query: 'test' },
            } as ToolRequestContent,
          ],
          toolCalls: [
            { id: '1', name: 'search', arguments: { query: 'test' } },
            { id: '2', name: 'calculator', arguments: { operation: 'add' } },
          ],
        } as AssistantMessage,
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      const content = result.messages[0]?.content as Array<unknown>
      expect(content.length).toBe(3)
      expect(content).toEqual([
        { type: 'text', text: 'I will help you' },
        {
          type: 'tool-call',
          toolCallId: '1',
          toolName: 'search',
          input: { query: 'test' },
        },
        {
          type: 'tool-call',
          toolCallId: '2',
          toolName: 'calculator',
          input: { operation: 'add' },
        },
      ])
    })
  })

  describe('tool results', () => {
    it('converts string result with typed output', () => {
      const messages: Message[] = [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: '1',
              toolName: 'calc',
              result: '42',
              isError: false,
            } as ToolResultContent,
          ],
        },
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      expect(result.messages[0]).toEqual({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: '1',
            toolName: 'calc',
            output: { type: 'text', value: '42' },
          },
        ],
      })
    })

    it('converts JSON result with typed output', () => {
      const messages: Message[] = [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: '5',
              toolName: 'calc',
              result: { value: 123 },
              isError: false,
            } as ToolResultContent,
          ],
        },
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      expect(result.messages[0]).toEqual({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: '5',
            toolName: 'calc',
            output: { type: 'json', value: { value: 123 } },
          },
        ],
      })
    })

    it('converts error JSON result', () => {
      const messages: Message[] = [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: '2',
              toolName: 'calc',
              result: { error: 'bad' },
              isError: true,
            } as ToolResultContent,
          ],
        },
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      expect(result.messages[0]).toEqual({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: '2',
            toolName: 'calc',
            output: { type: 'error-json', value: { error: 'bad' } },
          },
        ],
      })
    })

    it('converts error text result', () => {
      const messages: Message[] = [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: '3',
              toolName: 'calc',
              result: 'oops',
              isError: true,
            } as ToolResultContent,
          ],
        },
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      expect(result.messages[0]).toEqual({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: '3',
            toolName: 'calc',
            output: { type: 'error-text', value: 'oops' },
          },
        ],
      })
    })

    it('preserves toolName', () => {
      const messages: Message[] = [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: '1',
              toolName: 'calculator',
              result: '42',
              isError: false,
            } as ToolResultContent,
          ],
        },
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      const content = result.messages[0]?.content as Array<{ toolName: string }>
      expect(content[0].toolName).toBe('calculator')
    })
  })

  describe('provider metadata extraction', () => {
    it('extracts provider-specific attributes to providerOptions on messages', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' } as TextContent],
          cache_control: { type: 'ephemeral' },
        } as Message & { cache_control: unknown },
      ]

      const result = applyAllRules({
        providerType: Providers.Anthropic,
        messages,
        config: { model: 'claude-3-5-sonnet-latest' },
      })

      expect(
        (result.messages[0] as { providerOptions?: unknown }).providerOptions,
      ).toEqual({
        anthropic: { cacheControl: { type: 'ephemeral' } },
      })
    })
  })

  describe('mixed conversation', () => {
    it('handles full conversation with tools', () => {
      const messages: Message[] = [
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'You are a helpful assistant',
            } as TextContent,
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is 2+2?' } as TextContent],
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me calculate.' },
            {
              type: 'tool-call',
              toolCallId: 'calc-1',
              toolName: 'calculator',
              args: { expression: '2+2' },
            } as ToolRequestContent,
          ],
          toolCalls: null,
        } as AssistantMessage,
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'calc-1',
              toolName: 'calculator',
              result: '4',
              isError: false,
            } as ToolResultContent,
          ],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'The answer is 4!',
            },
          ],
          toolCalls: null,
        } as AssistantMessage,
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      expect(result.messages.length).toBe(5)
      expect(result.messages[0].role).toBe('system')
      expect(result.messages[1].role).toBe('user')
      expect(result.messages[2].role).toBe('assistant')
      expect(result.messages[3].role).toBe('tool')
      expect(result.messages[4].role).toBe('assistant')

      expect(result.messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant',
      })

      expect(result.messages[1]).toEqual({
        role: 'user',
        content: 'What is 2+2?',
      })

      expect(result.messages[2]).toEqual({
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me calculate.' },
          {
            type: 'tool-call',
            toolCallId: 'calc-1',
            toolName: 'calculator',
            input: { expression: '2+2' },
          },
        ],
      })

      expect(result.messages[3]).toEqual({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'calc-1',
            toolName: 'calculator',
            output: { type: 'text', value: '4' },
          },
        ],
      })

      expect(result.messages[4]).toEqual({
        role: 'assistant',
        content: 'The answer is 4!',
      })
    })
  })
})
