import { describe, it, expect } from 'vitest'
import { applyAllRules } from './index'
import { Providers } from '@latitude-data/constants'

describe('rules', () => {
  it('add providerOptions to rules config', () => {
    expect(
      applyAllRules({
        providerType: Providers.Anthropic,
        messages: [],
        config: {
          model: 'claude-3-7-sonnet-latest',
          thinking: { type: 'enabled', budgetTokens: 1024 },
        },
      }),
    ).toEqual({
      rules: [
        {
          rule: 'anthropic',
          ruleMessage:
            'Only system messages are present. You at least need one <user>your message</user> or <assistant>your message</assistant> in Anthropic.',
        },
      ],
      messages: [],
      config: {
        model: 'claude-3-7-sonnet-latest',
        thinking: { type: 'enabled', budgetTokens: 1024 },
        providerOptions: {
          anthropic: {
            model: 'claude-3-7-sonnet-latest',
            thinking: { type: 'enabled', budgetTokens: 1024 },
          },
        },
      },
    })
  })
})
