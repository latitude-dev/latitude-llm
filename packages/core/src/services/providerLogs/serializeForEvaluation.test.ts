import { describe, expect, it } from 'vitest'

import { type ProviderLog } from '../../schema/models/types/ProviderLog'
import { ProviderLogDto } from '../../schema/types'
import { formatContext, formatConversation } from './serializeForEvaluation'

describe('serialize', () => {
  it('should format a ProviderLogDto with response correctly', () => {
    const providerLogDto = {
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
        { role: 'assistant', content: 'Hi there', toolCalls: [] },
      ],
      response: 'How can I help you?',
      toolCalls: [],
    } as unknown as ProviderLogDto

    const result = formatConversation(providerLogDto)

    expect(result).toEqual({
      all: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
        { role: 'assistant', content: 'Hi there', toolCalls: [] },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'How can I help you?',
            },
          ],
          toolCalls: [],
        },
      ],
      first: {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
      last: {
        role: 'assistant',
        content: [{ type: 'text', text: 'How can I help you?' }],
        toolCalls: [],
      },
      user: {
        all: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        first: {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
        last: {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      },
      system: {
        all: [],
        first: null,
        last: null,
      },
      assistant: {
        all: [
          { role: 'assistant', content: 'Hi there', toolCalls: [] },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'How can I help you?',
              },
            ],
            toolCalls: [],
          },
        ],
        first: {
          role: 'assistant',
          content: 'Hi there',
          toolCalls: [],
        },
        last: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'How can I help you?',
            },
          ],
          toolCalls: [],
        },
      },
    })
  })

  it('should format a ProviderLog with responseText correctly', () => {
    const providerLog = {
      messages: [
        {
          role: 'system',
          content: [{ type: 'text', text: 'You are an AI assistant' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: "What's the weather like?" }],
        },
      ],
      responseText: 'The weather is sunny today.',
      toolCalls: [],
    } as unknown as ProviderLog

    const result = formatConversation(providerLog)

    expect(result).toEqual({
      all: [
        {
          role: 'system',
          content: [{ type: 'text', text: 'You are an AI assistant' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: "What's the weather like?" }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'The weather is sunny today.' }],
          toolCalls: [],
        },
      ],
      first: {
        role: 'system',
        content: [{ type: 'text', text: 'You are an AI assistant' }],
      },
      last: {
        role: 'assistant',
        content: [{ type: 'text', text: 'The weather is sunny today.' }],
        toolCalls: [],
      },
      user: {
        all: [
          {
            role: 'user',
            content: [{ type: 'text', text: "What's the weather like?" }],
          },
        ],
        first: {
          role: 'user',
          content: [{ type: 'text', text: "What's the weather like?" }],
        },
        last: {
          role: 'user',
          content: [{ type: 'text', text: "What's the weather like?" }],
        },
      },
      system: {
        all: [
          {
            role: 'system',
            content: [{ type: 'text', text: 'You are an AI assistant' }],
          },
        ],
        first: {
          role: 'system',
          content: [{ type: 'text', text: 'You are an AI assistant' }],
        },
        last: {
          role: 'system',
          content: [{ type: 'text', text: 'You are an AI assistant' }],
        },
      },
      assistant: {
        all: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'The weather is sunny today.' }],
            toolCalls: [],
          },
        ],
        first: {
          role: 'assistant',
          content: [{ type: 'text', text: 'The weather is sunny today.' }],
          toolCalls: [],
        },
        last: {
          role: 'assistant',
          content: [{ type: 'text', text: 'The weather is sunny today.' }],
          toolCalls: [],
        },
      },
    })
  })

  it('should format a ProviderLog with responseObject correctly', () => {
    const obj = { key: 'value', number: 42 }
    const objStr = JSON.stringify(obj, null, 2)
    const providerLog = {
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Give me a JSON object' }],
        },
      ],
      responseObject: obj,
      toolCalls: [],
    } as unknown as ProviderLog

    const result = formatConversation(providerLog)

    expect(result).toEqual({
      all: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Give me a JSON object' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: objStr }],
          toolCalls: [],
        },
      ],
      first: {
        role: 'user',
        content: [{ type: 'text', text: 'Give me a JSON object' }],
      },
      last: {
        role: 'assistant',
        content: [{ type: 'text', text: objStr }],
        toolCalls: [],
      },
      user: {
        all: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Give me a JSON object' }],
          },
        ],
        first: {
          role: 'user',
          content: [{ type: 'text', text: 'Give me a JSON object' }],
        },
        last: {
          role: 'user',
          content: [{ type: 'text', text: 'Give me a JSON object' }],
        },
      },
      system: {
        all: [],
        first: null,
        last: null,
      },
      assistant: {
        all: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: objStr }],
            toolCalls: [],
          },
        ],
        first: {
          role: 'assistant',
          content: [{ type: 'text', text: objStr }],
          toolCalls: [],
        },
        last: {
          role: 'assistant',
          content: [{ type: 'text', text: objStr }],
          toolCalls: [],
        },
      },
    })
  })

  it('should handle empty messages array', () => {
    const providerLog = {
      messages: [],
      responseText: 'Hello!',
      toolCalls: [],
    } as unknown as ProviderLog

    const result = formatConversation(providerLog)

    expect(result).toEqual({
      all: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          toolCalls: [],
        },
      ],
      first: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
        toolCalls: [],
      },
      last: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
        toolCalls: [],
      },
      user: {
        all: [],
        first: null,
        last: null,
      },
      system: {
        all: [],
        first: null,
        last: null,
      },
      assistant: {
        all: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello!' }],
            toolCalls: [],
          },
        ],
        first: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          toolCalls: [],
        },
        last: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          toolCalls: [],
        },
      },
    })
  })

  it('should format a ProviderLogDto removing source map correctly', () => {
    const providerLogDto = {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Hello',
              _promptlSourceMap: [{ start: 0, end: 4, identifier: 'text' }],
            },
          ],
        },
        { role: 'assistant', content: 'Hi there', toolCalls: [] },
      ],
      response: 'How can I help you?',
      toolCalls: [],
    } as unknown as ProviderLogDto

    const result = formatConversation(providerLogDto)

    expect(result).toEqual({
      all: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
        { role: 'assistant', content: 'Hi there', toolCalls: [] },
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'How can I help you?',
            },
          ],
          toolCalls: [],
        },
      ],
      first: {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
      last: {
        role: 'assistant',
        content: [{ type: 'text', text: 'How can I help you?' }],
        toolCalls: [],
      },
      user: {
        all: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        first: {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
        last: {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      },
      system: {
        all: [],
        first: null,
        last: null,
      },
      assistant: {
        all: [
          { role: 'assistant', content: 'Hi there', toolCalls: [] },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'How can I help you?',
              },
            ],
            toolCalls: [],
          },
        ],
        first: {
          role: 'assistant',
          content: 'Hi there',
          toolCalls: [],
        },
        last: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'How can I help you?',
            },
          ],
          toolCalls: [],
        },
      },
    })
  })
})

describe('formatContext', () => {
  it('should format a conversation with text content correctly', () => {
    const providerLog = {
      messages: [
        {
          role: 'system',
          content: [
            { type: 'text', text: 'You are an AI assistant' },
            { type: 'text', text: 'Answer succinctly yet complete' },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: "What's the weather like?" }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'The weather is sunny today.' }],
          toolCalls: [],
        },
      ],
      responseText: 'Is there anything else I can help you with?',
      toolCalls: [],
    } as unknown as ProviderLog

    const result = formatContext(providerLog)

    expect(result).toBe(
      'System:\nYou are an AI assistant\nAnswer succinctly yet complete\n\n' +
        "User:\nWhat's the weather like?\n\n" +
        'Assistant:\nThe weather is sunny today.',
    )
  })

  it('should handle image content in messages', () => {
    const providerLog = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What can you see in this image?' },
            {
              type: 'image',
              image: 'https://example.com/image.jpg',
            },
          ],
        },
        {
          role: 'assistant',
          content: 'I see a beautiful landscape.',
          toolCalls: [],
        },
      ],
      responseText: 'Would you like me to describe it in more detail?',
      toolCalls: [],
    } as unknown as ProviderLog

    const result = formatContext(providerLog)

    expect(result).toBe(
      'User:\nWhat can you see in this image?\n[IMAGE]\n\n' +
        'Assistant:\nI see a beautiful landscape.',
    )
  })

  it('should handle file content in messages', () => {
    const providerLog = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Summarize this file' },
            {
              type: 'file',
              file: 'https://example.com/file.pdf',
              mimeType: 'application/pdf',
            },
          ],
        },
        {
          role: 'assistant',
          content: 'No.',
          toolCalls: [],
        },
      ],
      responseText: 'Ask me again.',
      toolCalls: [],
    } as unknown as ProviderLog

    const result = formatContext(providerLog)

    expect(result).toBe(
      'User:\nSummarize this file\n[FILE]\n\n' + 'Assistant:\nNo.',
    )
  })

  it('should handle empty messages array', () => {
    const providerLog = {
      messages: [],
      responseText: 'Hello! How can I assist you today?',
      toolCalls: [],
    } as unknown as ProviderLog

    const result = formatContext(providerLog)

    expect(result).toBe('')
  })

  it('should handle messages with string content', () => {
    const providerLogDto = {
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Tell me a joke' }],
        },
        {
          role: 'assistant',
          content: 'Why did the chicken cross the road?',
          toolCalls: [],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: "I don't know, why?" }],
        },
      ],
      response: 'To get to the other side!',
      toolCalls: [],
    } as unknown as ProviderLogDto

    const result = formatContext(providerLogDto)

    expect(result).toBe(
      'User:\nTell me a joke\n\n' +
        'Assistant:\nWhy did the chicken cross the road?\n\n' +
        "User:\nI don't know, why?",
    )
  })

  it('should return an empty speaker response if message without content', async () => {
    const providerLogDto = {
      messages: [
        {
          role: 'user',
          content: [],
        },
      ],
      response: 'To get to the other side!',
      toolCalls: [],
    } as unknown as ProviderLogDto

    const result = formatContext(providerLogDto)

    expect(result).toBe('User:')
  })
})
