import { Message, MessageRole } from '@latitude-data/compiler'
import { beforeAll, describe, expect, it } from 'vitest'

import { applyCustomRules, ProviderRules } from '.'
import { PartialConfig } from '../../helpers'
import { Providers } from '../models'

const providerType = Providers.Google

let config = {} as PartialConfig
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
      const rules = applyCustomRules({ providerType, messages, config })

      const appliedMessages = rules.messages

      expect(appliedMessages.length).toBe(messages.length)
      expect(appliedMessages[0]).toEqual(messages[0])
      expect(appliedMessages[1]).toEqual(messages[1])
      expect(appliedMessages[2]).toEqual(messages[2])
      expect(appliedMessages[4]).toEqual({
        role: MessageRole.assistant,
        content: [{ type: 'text', text: messages[4]!.content }],
      })

      expect(appliedMessages[3]).toEqual({
        role: MessageRole.user,
        content: [{ type: 'text', text: messages[3]!.content }],
      })

      expect(appliedMessages[3]).toEqual({
        role: MessageRole.user,
        content: [{ type: 'text', text: messages[3]!.content }],
      })

      expect(appliedMessages[5]).toEqual({
        role: MessageRole.user,
        content: [
          { type: 'text', text: 'Use a short response' },
          { type: 'text', text: 'Second a short response' },
        ],
      })
    })

    it('generates warning when system messages are not at the beggining', () => {
      const rules = applyCustomRules({ providerType, messages, config })

      expect(rules.rules).toEqual([
        {
          rule: ProviderRules.Google,
          ruleMessage:
            'Google only supports system messages at the beggining of the conversation. All other system messages have been converted to user messages.',
        },
      ])
    })
  })
})
