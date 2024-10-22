import { Message, TextContent } from '@latitude-data/compiler'
import { describe, expect, it } from 'vitest'

import { applyCustomRules } from '.'
import { Providers } from '../models'

const providerType = Providers.Google

describe('applyGoogleRules', () => {
  it('does not modify the conversation when there are no system messages', () => {
    const messages = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
      {
        role: 'assistant',
        content: 'Hello! How are you?',
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'I am good' }],
      },
    ] as Message[]

    const rules = applyCustomRules({ providerType, messages })

    expect(rules.didApplyCustomRules).toBe(false)
    expect(rules.messages).toEqual(messages)
    expect(rules.ruleMessage).toBeUndefined()
  })

  it('does not modify the conversation when all system messages are at the beggining', () => {
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
        role: 'assistant',
        content: 'Hi! How are you doing today?',
      },
    ] as Message[]

    const rules = applyCustomRules({ providerType, messages })
    expect(rules.didApplyCustomRules).toBe(false)
  })

  it('only modifies system messages that are not at the beggining', () => {
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
        content: 'Hi! How are you doing today?',
      },
    ] as Message[]

    const rules = applyCustomRules({ providerType, messages })

    expect(rules.didApplyCustomRules).toBe(true)
    expect(rules.messages.length).toBe(messages.length)

    expect(rules.messages[0]).toEqual(messages[0])
    expect(rules.messages[1]).toEqual(messages[1])
    expect(rules.messages[2]).toEqual(messages[2])
    expect(rules.messages[4]).toEqual(messages[4])

    expect(rules.messages[3]!.role).toBe('user')
    expect((rules.messages[3]!.content[0] as TextContent)?.text).toEqual(
      messages[3]!.content,
    )
  })
})
