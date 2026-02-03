import type { Message } from '@latitude-data/constants/messages'
import { describe, expect, it } from 'vitest'

import { applyCustomRules } from './custom'
import { AppliedRules, ProviderRules } from './types'

const config = {} as AppliedRules['config']
describe('applyCustomRules', () => {
  it('not warns when no rules are violated', () => {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful chatbot',
      },
      {
        role: 'system',
        content: 'Respond to the user',
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
      {
        role: 'system',
        content: 'Use a short response',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Also here is an image',
          },
          {
            type: 'text',
            text: 'The image is a lie',
          },
          {
            type: 'reasoning',
            text: 'This is an assistant reasoning text',
          },
        ],
      },
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'Also here is an image',
          },
          {
            type: 'text',
            text: 'The image is a lie',
          },
        ],
      },
    ] as Message[]

    const rules = applyCustomRules({
      config,
      messages: messages,
      rules: [],
    })

    expect(rules).toEqual({
      config: {},
      messages: messages,
      rules: [],
    })
  })

  it('warns when system messages have unsupported content', () => {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful chatbot',
      },
      {
        role: 'system',
        content: 'Respond to the user',
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
      {
        role: 'system',
        content: 'Use a short response',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Also here is an image',
          },
          {
            type: 'text',
            text: 'The image is a lie',
          },
        ],
      },
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'Also here is an image',
          },
          {
            type: 'image',
            image: 'https://example.com/image.png',
          },
        ],
      },
    ] as Message[]

    const rules = applyCustomRules({
      rules: [],
      messages,
      config,
    })

    expect(rules).toEqual({
      config: {},
      messages: messages,
      rules: [
        {
          rule: ProviderRules.Custom,
          ruleMessage: 'System messages can only have text content.',
        },
      ],
    })
  })

  it('warns when assistant messages have unsupported content', () => {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful chatbot',
      },
      {
        role: 'system',
        content: 'Respond to the user',
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
      {
        role: 'system',
        content: 'Use a short response',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Also here is an image',
          },
          {
            type: 'image',
            image: 'https://example.com/image.png',
          },
        ],
      },
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'Also here is an image',
          },
          {
            type: 'text',
            text: 'The image is a lie',
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Also here is a file',
          },
          {
            type: 'file',
            file: 'https://example.com/file.pdf',
            mimeType: 'application/pdf',
          },
        ],
      },
    ] as Message[]

    const rules = applyCustomRules({
      rules: [],
      messages,
      config,
    })

    expect(rules).toEqual({
      config: {},
      messages: messages,
      rules: [
        {
          rule: ProviderRules.Custom,
          ruleMessage:
            'Assistant messages can only have text or tool call content.',
        },
      ],
    })
  })

  it('warns when multiple rules are violated', () => {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful chatbot',
      },
      {
        role: 'system',
        content: 'Respond to the user',
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
      {
        role: 'system',
        content: 'Use a short response',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Also here is an image',
          },
          {
            type: 'image',
            image: 'https://example.com/image.png',
          },
        ],
      },
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'Also here is an image',
          },
          {
            type: 'image',
            image: 'https://example.com/image.png',
          },
        ],
      },
    ] as Message[]

    const rules = applyCustomRules({
      rules: [],
      messages,
      config,
    })

    expect(rules).toEqual({
      config: {},
      messages: messages,
      rules: [
        {
          rule: ProviderRules.Custom,
          ruleMessage: 'System messages can only have text content.',
        },
        {
          rule: ProviderRules.Custom,
          ruleMessage:
            'Assistant messages can only have text or tool call content.',
        },
      ],
    })
  })
})
