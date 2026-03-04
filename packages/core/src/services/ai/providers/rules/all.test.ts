import { Providers } from '@latitude-data/constants'
import {
  AssistantMessage,
  FileContent,
  ImageContent,
  Message,
  TextContent,
  ToolRequestContent,
  ToolResultContent,
} from '@latitude-data/constants/messages'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { describe, expect, it } from 'vitest'
import { applyAllRules } from './all'
import { extractMessageMetadata } from './providerMetadata'

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
            providerOptions: {
              promptl: {
                _providerMetadata: {
                  _knownFields: { toolName: 'calc' },
                },
              },
            },
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
            providerOptions: {
              promptl: {
                _providerMetadata: {
                  _knownFields: { toolName: 'calc' },
                },
              },
            },
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
            providerOptions: {
              promptl: {
                _providerMetadata: {
                  _knownFields: { toolName: 'calc', isError: true },
                },
              },
            },
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
            providerOptions: {
              promptl: {
                _providerMetadata: {
                  _knownFields: { toolName: 'calc', isError: true },
                },
              },
            },
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

  describe('content-level metadata stripping', () => {
    it('strips _sourceData from tool-call content items', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_123',
              toolName: 'opensea_get_collections',
              args: { slugs: ['boredapeyachtclub'] },
              _sourceData: {
                source: ToolSource.Integration,
                integrationId: 2,
                toolName: 'get_collections',
                simulated: false,
              },
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

      const content = result.messages[0]?.content as unknown as Array<
        Record<string, unknown>
      >
      // _sourceData must not appear as a top-level field on the content item
      expect(content[0]).not.toHaveProperty('_sourceData')
      // The standard fields must be preserved
      expect(content[0]).toMatchObject({
        type: 'tool-call',
        toolCallId: 'call_123',
        toolName: 'opensea_get_collections',
      })
    })

    it('strips _promptlSourceMap from text content items', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Hello world',
              _promptlSourceMap: [{ start: 0, end: 11 }],
            } as TextContent,
          ],
        },
      ]

      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      // For single text content, rosetta may simplify to string
      // Either way, _promptlSourceMap must not survive
      const msg = result.messages[0] as Record<string, unknown>
      if (typeof msg.content === 'string') {
        expect(msg.content).toBe('Hello world')
      } else {
        const content = msg.content as Array<Record<string, unknown>>
        expect(content[0]).not.toHaveProperty('_promptlSourceMap')
      }
    })

    it('strips _sourceData and toolArguments from tool-call in multi-step chain replay', () => {
      // Simulates messages accumulated from step 1 being replayed in step 2
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Evaluate these collections' } as TextContent,
          ],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_1',
              toolName: 'get_collections',
              args: { slugs: ['boredapeyachtclub'] },
              toolArguments: { slugs: ['boredapeyachtclub'] },
              _sourceData: {
                source: ToolSource.Integration,
                integrationId: 2,
                toolName: 'get_collections',
                simulated: false,
              },
            } as ToolRequestContent,
            {
              type: 'tool-call',
              toolCallId: 'call_2',
              toolName: 'get_collections',
              args: { slugs: ['pudgypenguins'] },
              toolArguments: { slugs: ['pudgypenguins'] },
              _sourceData: {
                source: ToolSource.Integration,
                integrationId: 2,
                toolName: 'get_collections',
                simulated: false,
              },
            } as ToolRequestContent,
          ],
          toolCalls: [
            {
              id: 'call_1',
              name: 'get_collections',
              arguments: { slugs: ['boredapeyachtclub'] },
              _sourceData: {
                source: ToolSource.Integration,
                integrationId: 2,
                toolName: 'get_collections',
                simulated: false,
              },
            },
            {
              id: 'call_2',
              name: 'get_collections',
              arguments: { slugs: ['pudgypenguins'] },
              _sourceData: {
                source: ToolSource.Integration,
                integrationId: 2,
                toolName: 'get_collections',
                simulated: false,
              },
            },
          ],
        } as AssistantMessage,
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_1',
              toolName: 'get_collections',
              result: { collections: [{ slug: 'boredapeyachtclub' }] },
              isError: false,
            } as ToolResultContent,
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_2',
              toolName: 'get_collections',
              result: { collections: [{ slug: 'pudgypenguins' }] },
              isError: false,
            } as ToolResultContent,
          ],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: '{"violation": false}',
            },
          ],
          toolCalls: null,
        } as AssistantMessage,
      ]

      // This must not throw — the messages must be valid ModelMessage[]
      const result = applyAllRules({
        providerType: Providers.OpenAI,
        messages,
        config: defaultConfig,
      })

      // Assistant message with tool calls
      const assistantContent = result.messages[1]?.content as unknown as Array<
        Record<string, unknown>
      >
      for (const item of assistantContent) {
        if (item.type === 'tool-call') {
          expect(item).not.toHaveProperty('_sourceData')
          expect(item).not.toHaveProperty('toolArguments')
        }
      }
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
            providerOptions: {
              promptl: {
                _providerMetadata: {
                  _knownFields: { toolName: 'calculator' },
                },
              },
            },
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

describe('extractMessageMetadata', () => {
  describe('content-level internal field stripping', () => {
    it('strips _sourceData from tool-call content items', () => {
      const message: AssistantMessage = {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call_123',
            toolName: 'opensea_get_collections',
            args: { slugs: ['boredapeyachtclub'] },
            _sourceData: {
              source: 'integration',
              integrationId: 2,
              toolName: 'get_collections',
              simulated: false,
            },
          } as ToolRequestContent,
        ],
        toolCalls: null,
      }

      const result = extractMessageMetadata({
        message,
        provider: Providers.OpenAI,
      })

      const content = result.content as Array<Record<string, unknown>>
      expect(content[0]).not.toHaveProperty('_sourceData')
      expect(content[0]).toMatchObject({
        type: 'tool-call',
        toolCallId: 'call_123',
        toolName: 'opensea_get_collections',
        args: { slugs: ['boredapeyachtclub'] },
      })
    })

    it('strips _promptlSourceMap from text content items', () => {
      const message: Message = {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Hello world',
            _promptlSourceMap: [{ start: 0, end: 11 }],
          } as TextContent,
        ],
      }

      const result = extractMessageMetadata({
        message,
        provider: Providers.OpenAI,
      })

      const content = result.content as Array<Record<string, unknown>>
      expect(content[0]).not.toHaveProperty('_promptlSourceMap')
      expect(content[0]).toMatchObject({
        type: 'text',
        text: 'Hello world',
      })
    })

    it('strips toolArguments from tool-call content items', () => {
      const message: AssistantMessage = {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call_456',
            toolName: 'search',
            args: { query: 'test' },
            toolArguments: { query: 'test' },
          } as ToolRequestContent,
        ],
        toolCalls: null,
      }

      const result = extractMessageMetadata({
        message,
        provider: Providers.OpenAI,
      })

      const content = result.content as Array<Record<string, unknown>>
      expect(content[0]).not.toHaveProperty('toolArguments')
    })

    it('strips multiple internal fields from chain replay scenario', () => {
      const message: AssistantMessage = {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'get_collections',
            args: { slugs: ['boredapeyachtclub'] },
            toolArguments: { slugs: ['boredapeyachtclub'] },
            _sourceData: {
              source: 'integration',
              integrationId: 2,
              toolName: 'get_collections',
              simulated: false,
            },
          } as ToolRequestContent,
          {
            type: 'tool-call',
            toolCallId: 'call_2',
            toolName: 'get_collections',
            args: { slugs: ['pudgypenguins'] },
            toolArguments: { slugs: ['pudgypenguins'] },
            _sourceData: {
              source: 'integration',
              integrationId: 2,
              toolName: 'get_collections',
              simulated: false,
            },
          } as ToolRequestContent,
        ],
        toolCalls: [
          {
            id: 'call_1',
            name: 'get_collections',
            arguments: { slugs: ['boredapeyachtclub'] },
            _sourceData: {
              source: ToolSource.Integration,
              integrationId: 2,
              toolName: 'get_collections',
              simulated: false,
            },
          },
          {
            id: 'call_2',
            name: 'get_collections',
            arguments: { slugs: ['pudgypenguins'] },
            _sourceData: {
              source: ToolSource.Integration,
              integrationId: 2,
              toolName: 'get_collections',
              simulated: false,
            },
          },
        ],
      }

      const result = extractMessageMetadata({
        message,
        provider: Providers.OpenAI,
      })

      const content = result.content as Array<Record<string, unknown>>
      for (const item of content) {
        expect(item).not.toHaveProperty('_sourceData')
        expect(item).not.toHaveProperty('toolArguments')
        expect(item).not.toHaveProperty('_promptlSourceMap')
      }
    })

    it('preserves provider-specific content attributes like cache_control', () => {
      const message: Message = {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Important message',
            cache_control: { type: 'ephemeral' },
          } as TextContent & { cache_control: unknown },
        ],
      }

      const result = extractMessageMetadata({
        message,
        provider: Providers.Anthropic,
      })

      const content = result.content as Array<Record<string, unknown>>
      // cache_control should be moved to providerOptions, not left as raw field
      expect(content[0]).not.toHaveProperty('cache_control')
      expect(content[0]).toHaveProperty('providerOptions')
      expect(
        (
          content[0] as {
            providerOptions: Record<string, Record<string, unknown>>
          }
        ).providerOptions.anthropic,
      ).toEqual({ cacheControl: { type: 'ephemeral' } })
    })
  })
})
