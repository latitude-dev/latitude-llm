import type { Message } from '@latitude-data/constants/messages'
import { beforeAll, describe, expect, it } from 'vitest'

import { applyProviderRules } from '.'
import { Providers } from '@latitude-data/constants'
import { AppliedRules, ProviderRules } from './types'

const providerType = Providers.Google

const config = {} as AppliedRules['config']
let messages: Message[]
describe('applyGoogleRules', () => {
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
        role: 'user',
        content: [{ type: 'text', text: messages[3]!.content }],
      })
      expect(appliedMessages[4]).toEqual(messages[4])
      expect(appliedMessages[5]).toEqual({
        role: 'user',
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
          rule: ProviderRules.Google,
          ruleMessage:
            'Google only supports system messages at the beggining of the conversation. All other system messages have been converted to user messages.',
        },
      ])
    })
  })

  describe('when no user message is present', () => {
    beforeAll(() => {
      messages = [
        { role: 'system', content: [{ type: 'text', text: 'System only' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
      ] as Message[]
    })

    it('fails with a rule requiring at least one user message', () => {
      const rules = applyProviderRules({ providerType, messages, config })

      expect(rules.rules).toContainEqual({
        rule: ProviderRules.Google,
        ruleMessage: 'Google requires at least one user message',
      })
    })
  })
})
