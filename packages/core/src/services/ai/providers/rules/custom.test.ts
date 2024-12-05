import type { Message } from '@latitude-data/compiler'
import { describe, expect, it } from 'vitest'

import { applyCustomRules } from './custom'
import { ProviderRules } from './types'

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
      config: {},
      messages: messages,
      rules: [],
    })

    expect(rules).toEqual({
      config: {},
      messages: messages,
      rules: [],
    })
  })

  it('warns when system messages have non-text content', () => {
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
      config: {},
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

  it('warns when assistant messages have images', () => {
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
    ] as Message[]

    const rules = applyCustomRules({
      rules: [],
      messages,
      config: {},
    })

    expect(rules).toEqual({
      config: {},
      messages: messages,
      rules: [
        {
          rule: ProviderRules.Custom,
          ruleMessage: 'Assistant messages cannot have images.',
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
      config: {},
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
          ruleMessage: 'Assistant messages cannot have images.',
        },
      ],
    })
  })
})
