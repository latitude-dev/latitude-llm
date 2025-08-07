import { Providers } from '@latitude-data/constants'
import { describe, expect, it } from 'vitest'
import { applyAllRules } from './index'

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

  it('camelCase all providerOptions', () => {
    expect(
      applyAllRules({
        providerType: Providers.OpenAI,
        messages: [],
        config: {
          model: 'gpt4-o',
          something_underscored: {
            type: 'enabled',
            things_to_do: [
              { thing_one: 'Thing one' },
              { thing_two: 'Thing two' },
            ],
          },
        },
      }),
    ).toEqual({
      rules: [],
      messages: [],
      config: {
        model: 'gpt4-o',
        something_underscored: {
          type: 'enabled',
          things_to_do: [
            { thing_one: 'Thing one' },
            { thing_two: 'Thing two' },
          ],
        },
        providerOptions: {
          openai: {
            model: 'gpt4-o',
            somethingUnderscored: {
              type: 'enabled',
              thingsToDo: [
                { thingOne: 'Thing one' },
                { thingTwo: 'Thing two' },
              ],
            },
          },
        },
      },
    })
  })
})
