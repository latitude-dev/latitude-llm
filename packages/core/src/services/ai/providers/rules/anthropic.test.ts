import { Message, TextContent } from '@latitude-data/compiler'
import { describe, expect, it } from 'vitest'

import { applyCustomRules } from '.'
import { Providers } from '../models'

const providerType = Providers.Anthropic

describe('applyAntrhopicRules', () => {
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

    expect(rules).toBeUndefined()
  })

  it('converts any system message to user messages', () => {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful chatbot',
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
      {
        role: 'system',
        content: 'Respond to the user',
      },
      {
        role: 'assistant',
        content: 'Hi! How are you doing today?',
      },
    ] as Message[]

    const rules = applyCustomRules({ providerType, messages })

    expect(rules?.messages.length).toBe(messages.length)

    expect(rules?.messages[0]!.role).toBe('user')
    expect((rules?.messages[0]!.content[0] as TextContent)?.text).toEqual(
      messages[0]!.content,
    )

    expect(rules?.messages[1]).toEqual(messages[1])

    expect(rules?.messages[2]!.role).toBe('user')
    expect((rules?.messages[2]!.content[0] as TextContent)?.text).toEqual(
      messages[2]!.content,
    )

    expect(rules?.messages[3]).toEqual(messages[3])
  })
})
