import { ContentType, MessageRole } from '@latitude-data/compiler'
import { describe, expect, it } from 'vitest'

import { ProviderLog, ProviderLogDto } from '../../browser'
import { formatContext, formatConversation } from './serialize'

describe('serialize', () => {
  it('should format a ProviderLogDto with response correctly', () => {
    // @ts-expect-error
    const providerLogDto: ProviderLogDto = {
      messages: [
        {
          role: MessageRole.user,
          content: [{ type: ContentType.text, text: 'Hello' }],
        },
        { role: MessageRole.assistant, content: 'Hi there', toolCalls: [] },
      ],
      response: 'How can I help you?',
      toolCalls: [],
    }

    const result = formatConversation(providerLogDto)

    expect(result).toEqual({
      all: [
        {
          role: MessageRole.user,
          content: [{ type: ContentType.text, text: 'Hello' }],
        },
        { role: MessageRole.assistant, content: 'Hi there', toolCalls: [] },
        {
          role: MessageRole.assistant,
          content: 'How can I help you?',
          toolCalls: [],
        },
      ],
      first: {
        role: MessageRole.user,
        content: [{ type: ContentType.text, text: 'Hello' }],
      },
      last: {
        role: MessageRole.assistant,
        content: 'How can I help you?',
        toolCalls: [],
      },
      user: {
        all: [
          {
            role: MessageRole.user,
            content: [{ type: ContentType.text, text: 'Hello' }],
          },
        ],
        first: {
          role: MessageRole.user,
          content: [{ type: ContentType.text, text: 'Hello' }],
        },
        last: {
          role: MessageRole.user,
          content: [{ type: ContentType.text, text: 'Hello' }],
        },
      },
      system: {
        all: [],
        first: null,
        last: null,
      },
      assistant: {
        all: [
          { role: MessageRole.assistant, content: 'Hi there', toolCalls: [] },
          {
            role: MessageRole.assistant,
            content: 'How can I help you?',
            toolCalls: [],
          },
        ],
        first: {
          role: MessageRole.assistant,
          content: 'Hi there',
          toolCalls: [],
        },
        last: {
          role: MessageRole.assistant,
          content: 'How can I help you?',
          toolCalls: [],
        },
      },
    })
  })

  it('should format a ProviderLog with responseText correctly', () => {
    // @ts-expect-error
    const providerLog: ProviderLog = {
      messages: [
        {
          role: MessageRole.system,
          content: [
            { type: ContentType.text, text: 'You are an AI assistant' },
          ],
        },
        {
          role: MessageRole.user,
          content: [
            { type: ContentType.text, text: "What's the weather like?" },
          ],
        },
      ],
      responseText: 'The weather is sunny today.',
      toolCalls: [],
    }

    const result = formatConversation(providerLog)

    expect(result).toEqual({
      all: [
        {
          role: MessageRole.system,
          content: [
            { type: ContentType.text, text: 'You are an AI assistant' },
          ],
        },
        {
          role: MessageRole.user,
          content: [
            { type: ContentType.text, text: "What's the weather like?" },
          ],
        },
        {
          role: MessageRole.assistant,
          content: 'The weather is sunny today.',
          toolCalls: [],
        },
      ],
      first: {
        role: MessageRole.system,
        content: [{ type: ContentType.text, text: 'You are an AI assistant' }],
      },
      last: {
        role: MessageRole.assistant,
        content: 'The weather is sunny today.',
        toolCalls: [],
      },
      user: {
        all: [
          {
            role: MessageRole.user,
            content: [
              { type: ContentType.text, text: "What's the weather like?" },
            ],
          },
        ],
        first: {
          role: MessageRole.user,
          content: [
            { type: ContentType.text, text: "What's the weather like?" },
          ],
        },
        last: {
          role: MessageRole.user,
          content: [
            { type: ContentType.text, text: "What's the weather like?" },
          ],
        },
      },
      system: {
        all: [
          {
            role: MessageRole.system,
            content: [
              { type: ContentType.text, text: 'You are an AI assistant' },
            ],
          },
        ],
        first: {
          role: MessageRole.system,
          content: [
            { type: ContentType.text, text: 'You are an AI assistant' },
          ],
        },
        last: {
          role: MessageRole.system,
          content: [
            { type: ContentType.text, text: 'You are an AI assistant' },
          ],
        },
      },
      assistant: {
        all: [
          {
            role: MessageRole.assistant,
            content: 'The weather is sunny today.',
            toolCalls: [],
          },
        ],
        first: {
          role: MessageRole.assistant,
          content: 'The weather is sunny today.',
          toolCalls: [],
        },
        last: {
          role: MessageRole.assistant,
          content: 'The weather is sunny today.',
          toolCalls: [],
        },
      },
    })
  })

  it('should format a ProviderLog with responseObject correctly', () => {
    const obj = { key: 'value', number: 42 }
    const objStr = JSON.stringify(obj, null, 2)
    // @ts-expect-error
    const providerLog: ProviderLog = {
      messages: [
        {
          role: MessageRole.user,
          content: [{ type: ContentType.text, text: 'Give me a JSON object' }],
        },
      ],
      responseObject: obj,
      toolCalls: [],
    }

    const result = formatConversation(providerLog)

    expect(result).toEqual({
      all: [
        {
          role: MessageRole.user,
          content: [{ type: ContentType.text, text: 'Give me a JSON object' }],
        },
        {
          role: MessageRole.assistant,
          content: objStr,
          toolCalls: [],
        },
      ],
      first: {
        role: MessageRole.user,
        content: [{ type: ContentType.text, text: 'Give me a JSON object' }],
      },
      last: {
        role: MessageRole.assistant,
        content: objStr,
        toolCalls: [],
      },
      user: {
        all: [
          {
            role: MessageRole.user,
            content: [
              { type: ContentType.text, text: 'Give me a JSON object' },
            ],
          },
        ],
        first: {
          role: MessageRole.user,
          content: [{ type: ContentType.text, text: 'Give me a JSON object' }],
        },
        last: {
          role: MessageRole.user,
          content: [{ type: ContentType.text, text: 'Give me a JSON object' }],
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
            role: MessageRole.assistant,
            content: objStr,
            toolCalls: [],
          },
        ],
        first: {
          role: MessageRole.assistant,
          content: objStr,
          toolCalls: [],
        },
        last: {
          role: MessageRole.assistant,
          content: objStr,
          toolCalls: [],
        },
      },
    })
  })

  it('should handle empty messages array', () => {
    // @ts-expect-error
    const providerLog: ProviderLog = {
      messages: [],
      responseText: 'Hello!',
      toolCalls: [],
    }

    const result = formatConversation(providerLog)

    expect(result).toEqual({
      all: [{ role: MessageRole.assistant, content: 'Hello!', toolCalls: [] }],
      first: { role: MessageRole.assistant, content: 'Hello!', toolCalls: [] },
      last: { role: MessageRole.assistant, content: 'Hello!', toolCalls: [] },
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
          { role: MessageRole.assistant, content: 'Hello!', toolCalls: [] },
        ],
        first: {
          role: MessageRole.assistant,
          content: 'Hello!',
          toolCalls: [],
        },
        last: { role: MessageRole.assistant, content: 'Hello!', toolCalls: [] },
      },
    })
  })
})

describe('formatContext', () => {
  it('should format a conversation with text messages correctly', () => {
    // @ts-expect-error
    const providerLog: ProviderLog = {
      messages: [
        {
          role: MessageRole.system,
          content: [
            { type: ContentType.text, text: 'You are an AI assistant' },
          ],
        },
        {
          role: MessageRole.user,
          content: [
            { type: ContentType.text, text: "What's the weather like?" },
          ],
        },
        {
          role: MessageRole.assistant,
          content: 'The weather is sunny today.',
          toolCalls: [],
        },
      ],
      responseText: 'Is there anything else I can help you with?',
      toolCalls: [],
    }

    const result = formatContext(providerLog)

    expect(result).toBe(
      'System:\nYou are an AI assistant\n\n' +
        "User:\nWhat's the weather like?\n\n" +
        'Assistant:\nThe weather is sunny today.',
    )
  })

  it('should handle image content in messages', () => {
    // @ts-expect-error
    const providerLog: ProviderLog = {
      messages: [
        {
          role: MessageRole.user,
          content: [
            { type: ContentType.text, text: 'What can you see in this image?' },
            {
              type: ContentType.image,
              image: 'https://example.com/image.jpg',
            },
          ],
        },
        {
          role: MessageRole.assistant,
          content: 'I see a beautiful landscape.',
          toolCalls: [],
        },
      ],
      responseText: 'Would you like me to describe it in more detail?',
      toolCalls: [],
    }

    const result = formatContext(providerLog)

    expect(result).toBe(
      'User:\nWhat can you see in this image?\n\n' +
        'Assistant:\nI see a beautiful landscape.',
    )
  })

  it('should handle empty messages array', () => {
    // @ts-expect-error
    const providerLog: ProviderLog = {
      messages: [],
      responseText: 'Hello! How can I assist you today?',
      toolCalls: [],
    }

    const result = formatContext(providerLog)

    expect(result).toBe('')
  })

  it('should handle messages with string content', () => {
    // @ts-expect-error
    const providerLogDto: ProviderLogDto = {
      messages: [
        {
          role: MessageRole.user,
          content: [{ type: ContentType.text, text: 'Tell me a joke' }],
        },
        {
          role: MessageRole.assistant,
          content: 'Why did the chicken cross the road?',
          toolCalls: [],
        },
        {
          role: MessageRole.user,
          content: [{ type: ContentType.text, text: "I don't know, why?" }],
        },
      ],
      response: 'To get to the other side!',
      toolCalls: [],
    }

    const result = formatContext(providerLogDto)

    expect(result).toBe(
      'User:\nTell me a joke\n\n' +
        'Assistant:\nWhy did the chicken cross the road?\n\n' +
        "User:\nI don't know, why?",
    )
  })

  it('should return an empty speaker response if message without content', async () => {
    // @ts-expect-error
    const providerLogDto: ProviderLogDto = {
      messages: [
        {
          role: MessageRole.user,
          content: [],
        },
      ],
      response: 'To get to the other side!',
      toolCalls: [],
    }

    const result = formatContext(providerLogDto)

    expect(result).toBe('User:')
  })
})
