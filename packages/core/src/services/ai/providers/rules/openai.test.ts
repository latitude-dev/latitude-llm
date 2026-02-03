import {
  type Message,
  MessageRole,
} from '@latitude-data/constants/messages'
import { describe, expect, it } from 'vitest'

import { Providers } from '@latitude-data/constants'
import { AppliedRules, ProviderRules } from './types'
import { applyProviderRules } from '.'

let model = 'o1-mini'
let config = { model } as AppliedRules['config']
describe('applyOpenAIRules', () => {
  it('Warns when model is in the o1 family and has system messages', () => {
    const messages = [
      {
        role: MessageRole.system,
        content: [{ type: 'text', text: 'You are a helpful chatbot' }],
      },
      {
        role: MessageRole.user,
        content: [{ type: 'text', text: 'Respond to the user' }],
      },
    ] as Message[]

    const rules = applyProviderRules({
      providerType: Providers.OpenAI,
      messages,
      config,
    })

    expect(rules.rules).toEqual([
      {
        rule: ProviderRules.OpenAI,
        ruleMessage:
          'Old reasoning models of OpenAI\'s "o1" family don\'t support system messages. These messages will be converted to <user>your text</user> to indicate user messages.',
      },
    ])
  })

  it('convert system messages to user messages when model is an old version in the o1 family', () => {
    const messages = [
      {
        role: MessageRole.system,
        content: [{ type: 'text', text: 'You are a helpful chatbot' }],
      },
    ] as Message[]

    const rules = applyProviderRules({
      providerType: Providers.OpenAI,
      messages,
      config,
    })

    expect(rules.messages).toEqual([
      {
        role: MessageRole.user,
        content: [{ type: 'text', text: 'You are a helpful chatbot' }],
      },
    ])
  })

  it('does not warn when model official o1', () => {
    model = 'o1'
    config = { model } as AppliedRules['config']

    const messages = [
      {
        role: MessageRole.system,
        content: [{ type: 'text', text: 'You are a helpful chatbot' }],
      },
      {
        role: MessageRole.user,
        content: [{ type: 'text', text: 'Respond to the user' }],
      },
    ] as Message[]

    const rules = applyProviderRules({
      providerType: Providers.OpenAI,
      messages,
      config,
    })

    expect(rules.rules).toEqual([])
  })

  it('does not warn when model is not in the o1 family', () => {
    model = 'gpt-3.5-turbo'
    config = { model } as AppliedRules['config']

    const messages = [
      {
        role: MessageRole.system,
        content: [{ type: 'text', text: 'You are a helpful chatbot' }],
      },
      {
        role: MessageRole.user,
        content: [{ type: 'text', text: 'Respond to the user' }],
      },
    ] as Message[]

    const rules = applyProviderRules({
      providerType: Providers.OpenAI,
      messages,
      config,
    })

    expect(rules.rules).toEqual([])
  })
})
