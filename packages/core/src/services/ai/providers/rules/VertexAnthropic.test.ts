import {
  type Message,
  MessageRole,
} from '@latitude-data/constants/messages'
import { beforeAll, describe, expect, it } from 'vitest'

import { Providers } from '@latitude-data/constants'
import { applyProviderRules } from './index'
import { AppliedRules, ProviderRules } from './types'

const providerType = Providers.AnthropicVertex

const config = {} as AppliedRules['config']
let messages: Message[]
describe('applyAnthropicRules', () => {
  describe('with system messages not at the beggining', () => {
    beforeAll(() => {
      messages = [
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
          content: 'Hi! How are you doing today?',
        },
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'Use a short response',
            },
            {
              type: 'text',
              text: 'Second a short response',
            },
          ],
        },
      ] as Message[]
    })

    it('only modifies system messages that are not at the beggining', () => {
      const rules = applyProviderRules({ providerType, messages, config })

      const appliedMessages = rules.messages

      expect(appliedMessages.length).toBe(messages.length)
      expect(appliedMessages[0]).toEqual(messages[0])
      expect(appliedMessages[1]).toEqual(messages[1])
      expect(appliedMessages[2]).toEqual(messages[2])
      expect(appliedMessages[3]).toEqual({
        role: MessageRole.user,
        content: [{ type: 'text', text: messages[3]!.content }],
      })
      expect(appliedMessages[4]).toEqual(messages[4])
      expect(appliedMessages[5]).toEqual({
        role: MessageRole.user,
        content: [
          { type: 'text', text: 'Use a short response' },
          { type: 'text', text: 'Second a short response' },
        ],
      })
    })

    it('generates warning when system messages are not at the beggining', () => {
      const rules = applyProviderRules({ providerType, messages, config })

      expect(rules.rules).toEqual([
        {
          rule: ProviderRules.VertexAntropic,
          ruleMessage:
            'Anthropic only supports system messages at the beggining of the conversation. All other system messages have been converted to user messages.',
        },
      ])
    })
  })

  it('Warns when only system messages are present', () => {
    const theMessages = [
      {
        role: MessageRole.system,
        content: [{ type: 'text', text: 'You are a helpful chatbot' }],
      },
      {
        role: MessageRole.system,
        content: [{ type: 'text', text: 'Respond to the user' }],
      },
    ] as Message[]
    const rules = applyProviderRules({
      providerType,
      messages: theMessages,
      config,
    })
    expect(rules.rules).toEqual([
      {
        rule: ProviderRules.VertexAntropic,
        ruleMessage:
          'Only system messages are present. You at least need one <user>your message</user> or <assistant>your message</assistant> in Anthropic.',
      },
    ])
  })
})
