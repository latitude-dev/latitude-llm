import { describe, it, expect } from 'vitest'
import type { ToolResultPart } from 'ai'

import {
  TextContent,
  ImageContent,
  FileContent,
  ToolContent,
  AssistantMessage,
  Message,
  MessageRole,
} from '@latitude-data/constants/legacyCompiler'
import { convertLatitudeMessagesToVercelFormat } from './convertLatitudeMessagesToVercelFormat'
import { Providers } from '@latitude-data/constants'

function getToolResultOutput(part: unknown): ToolResultPart['output'] {
  if (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    (part as { type: string }).type === 'tool-result' &&
    'output' in part
  ) {
    return (part as ToolResultPart).output
  }
  throw new Error(`Expected ToolResultPart, got: ${JSON.stringify(part)}`)
}

describe('convertLatitudeMessagesToVercelFormat', () => {
  it('converts system messages by joining text parts', () => {
    const messages: Message[] = [
      {
        role: MessageRole.system,
        content: [
          { type: 'text', text: 'part1' } as TextContent,
          { type: 'text', text: 'part2' } as TextContent,
        ],
      },
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    expect(result).toEqual([{ role: 'system', content: 'part1\npart2' }])
  })

  it('converts single text user message into a string', () => {
    const messages: Message[] = [
      {
        role: MessageRole.user,
        content: [{ type: 'text', text: 'Hello' } as TextContent],
      },
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    expect(result).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('converts user message with multiple parts into array', () => {
    const messages: Message[] = [
      {
        role: MessageRole.user,
        content: [
          { type: 'text', text: 'Hello' } as TextContent,
          { type: 'image', image: 'url.png' } as ImageContent,
        ],
      },
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    expect(result[0].content).toEqual([
      { type: 'text', text: 'Hello' },
      { type: 'image', image: 'url.png' },
    ])
  })

  it('converts user file message', () => {
    const messages: Message[] = [
      {
        role: MessageRole.user,
        content: [
          { type: 'file', file: 'blob', mimeType: 'app/pdf' } as FileContent,
        ],
      },
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    expect(result[0].content).toEqual([
      { type: 'file', data: 'blob', mediaType: 'app/pdf' },
    ])
  })

  it('converts assistant string content into text part', () => {
    const messages: Message[] = [
      {
        role: MessageRole.assistant,
        content: 'Hello from assistant',
      } as AssistantMessage,
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    expect(result[0].content).toEqual([
      { type: 'text', text: 'Hello from assistant' },
    ])
  })

  it('converts assistant array content into text, file, reasoning, redacted-reasoning', () => {
    const messages: Message[] = [
      {
        role: MessageRole.assistant,
        content: [
          { type: 'text', text: 'thinking' },
          { type: 'file', file: 'blob', mimeType: 'app/pdf' } as FileContent,
          { type: 'reasoning', text: 'reason' },
          { type: 'redacted-reasoning', data: 'hidden' },
        ],
      } as AssistantMessage,
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    expect(result[0].content).toEqual([
      { type: 'text', text: 'thinking' },
      { type: 'file', data: 'blob', mediaType: 'app/pdf' },
      { type: 'reasoning', text: 'reason' },
      { type: 'reasoning', text: '[REDACTED] hidden' },
    ])
  })

  it('converts assistant content with inline tool-call (ToolRequestContent[])', () => {
    const messages: Message[] = [
      {
        role: MessageRole.assistant,
        toolCalls: [{ id: '1', name: 'search', arguments: { query: 'hi' } }],
        content: [
          {
            type: 'tool-call',
            toolCallId: '123',
            toolName: 'search',
            args: { query: 'test' },
          },
        ],
      } as AssistantMessage,
    ]

    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })

    expect(result[0].content).toEqual([
      {
        type: 'tool-call',
        toolCallId: '123',
        toolName: 'search',
        input: { query: 'test' },
      },
      {
        type: 'tool-call',
        toolCallId: '1',
        toolName: 'search',
        input: { query: 'hi' },
      },
    ])
  })

  it('converts assistant.toolCalls into tool-call parts', () => {
    const messages: Message[] = [
      {
        role: MessageRole.assistant,
        content: '',
        toolCalls: [{ id: '1', name: 'search', arguments: { query: 'hi' } }],
      } as AssistantMessage,
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    expect(result[0].content).toEqual([
      { type: 'text', text: '' },
      {
        type: 'tool-call',
        toolCallId: '1',
        toolName: 'search',
        input: { query: 'hi' },
      },
    ])
  })

  it('converts assistant content with tool-result part', () => {
    const messages: Message[] = [
      {
        role: MessageRole.assistant,
        content: [
          {
            type: 'tool-result',
            toolCallId: '99',
            toolName: 'fetcher',
            result: 'done',
            isError: false,
          } as ToolContent,
        ],
      } as AssistantMessage,
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    expect(result[0].content[0]).toMatchObject({
      type: 'tool-result',
      toolCallId: '99',
      toolName: 'fetcher',
      output: { type: 'text', value: 'done' },
    })
  })

  it('converts tool messages with tool-result string output', () => {
    const messages: Message[] = [
      {
        role: MessageRole.tool,
        content: [
          {
            type: 'tool-result',
            toolCallId: '1',
            toolName: 'calc',
            result: '42',
            isError: false,
          },
        ],
      },
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    const output = getToolResultOutput(result[0].content[0])
    expect(output).toEqual({ type: 'text', value: '42' })
  })

  it('converts tool messages with tool-result error-json', () => {
    const messages: Message[] = [
      {
        role: MessageRole.tool,
        content: [
          {
            type: 'tool-result',
            toolCallId: '2',
            toolName: 'calc',
            result: { error: 'bad' },
            isError: true,
          },
        ],
      },
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    const output = getToolResultOutput(result[0].content[0])
    expect(output).toEqual({
      type: 'error-json',
      value: { error: 'bad' },
    })
  })

  it('converts tool messages with tool-result error-text', () => {
    const messages: Message[] = [
      {
        role: MessageRole.tool,
        content: [
          {
            type: 'tool-result',
            toolCallId: '3',
            toolName: 'calc',
            result: 'oops',
            isError: true,
          },
        ],
      },
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    const output = getToolResultOutput(result[0].content[0])
    expect(output).toEqual({
      type: 'error-text',
      value: 'oops',
    })
  })

  it('converts tool messages with tool-result content array', () => {
    const messages: Message[] = [
      {
        role: MessageRole.tool,
        content: [
          {
            type: 'tool-result',
            toolCallId: '4',
            toolName: 'calc',
            result: [
              { type: 'text', text: 'hi' },
              { type: 'media', data: 'xxx', mediaType: 'image/png' },
            ],
          },
        ],
      },
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    const output = getToolResultOutput(result[0].content[0])
    expect(output).toEqual({
      type: 'content',
      value: [
        { type: 'text', text: 'hi' },
        { type: 'media', data: 'xxx', mediaType: 'image/png' },
      ],
    })
  })

  it('converts tool messages with tool-result JSON output', () => {
    const messages: Message[] = [
      {
        role: MessageRole.tool,
        content: [
          {
            type: 'tool-result',
            toolCallId: '5',
            toolName: 'calc',
            result: { value: 123 },
            isError: false,
          },
        ],
      },
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    const output = getToolResultOutput(result[0].content[0])
    expect(output).toEqual({
      type: 'json',
      value: { value: 123 },
    })
  })

  it('throws error for unknown roles', () => {
    const messages = [
      { role: 'unknown' as MessageRole, content: '???' } as unknown as Message,
    ]
    expect(() =>
      convertLatitudeMessagesToVercelFormat({
        messages,
        provider: Providers.Anthropic,
      }),
    ).toThrow()
  })

  it('filters out assistant messages with empty string content and no toolCalls', () => {
    const messages: Message[] = [
      {
        role: MessageRole.assistant,
        content: '',
      } as AssistantMessage,
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    expect(result).toEqual([])
  })

  it('filters out assistant messages with empty array content and no toolCalls', () => {
    const messages = [{ role: MessageRole.assistant, content: [] }]
    const result = convertLatitudeMessagesToVercelFormat({
      // @ts-expect-error - testing edge case
      messages,
      provider: Providers.Anthropic,
    })
    expect(result).toEqual([])
  })

  it('filters out assistant messages where array content only has empty text parts', () => {
    const messages: Message[] = [
      {
        role: MessageRole.assistant,
        content: [{ type: 'text', text: '' }],
      } as AssistantMessage,
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    expect(result).toEqual([])
  })

  it('keeps assistant messages with toolCalls even if content is empty', () => {
    const messages: Message[] = [
      {
        role: MessageRole.assistant,
        content: '',
        toolCalls: [{ id: '1', name: 'search', arguments: { query: 'hi' } }],
      } as AssistantMessage,
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    expect(result).toHaveLength(1)
    expect(result[0].content).toEqual([
      { type: 'text', text: '' },
      {
        type: 'tool-call',
        toolCallId: '1',
        toolName: 'search',
        input: { query: 'hi' },
      },
    ])
  })

  it('only adds tool calls from toolCalls that are not already in content', () => {
    const messages: Message[] = [
      {
        role: MessageRole.assistant,
        content: [
          {
            type: 'tool-call',
            toolCallId: '1',
            toolName: 'search',
            args: { query: 'test' },
          },
        ],
        toolCalls: [
          { id: '1', name: 'search', arguments: { query: 'test' } },
          { id: '2', name: 'calculator', arguments: { operation: 'add' } },
        ],
      } as AssistantMessage,
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    expect(result[0].content).toEqual([
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

  it('handles mixed content with text and tool calls, preventing duplicates', () => {
    const messages: Message[] = [
      {
        role: MessageRole.assistant,
        content: [
          { type: 'text', text: 'I will help you with that' },
          {
            type: 'tool-call',
            toolCallId: '1',
            toolName: 'search',
            args: { query: 'test' },
          },
        ],
        toolCalls: [
          { id: '1', name: 'search', arguments: { query: 'test' } },
          { id: '2', name: 'calculator', arguments: { operation: 'add' } },
        ],
      } as AssistantMessage,
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    expect(result[0].content).toEqual([
      { type: 'text', text: 'I will help you with that' },
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

  it('does not add any tool calls when all are already in content', () => {
    const messages: Message[] = [
      {
        role: MessageRole.assistant,
        content: [
          {
            type: 'tool-call',
            toolCallId: '1',
            toolName: 'search',
            args: { query: 'test' },
          },
          {
            type: 'tool-call',
            toolCallId: '2',
            toolName: 'calculator',
            args: { operation: 'add' },
          },
        ],
        toolCalls: [
          { id: '1', name: 'search', arguments: { query: 'test' } },
          { id: '2', name: 'calculator', arguments: { operation: 'add' } },
        ],
      } as AssistantMessage,
    ]
    const result = convertLatitudeMessagesToVercelFormat({
      messages,
      provider: Providers.Anthropic,
    })
    expect(result[0].content).toEqual([
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
