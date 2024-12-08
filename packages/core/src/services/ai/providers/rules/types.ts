import type { Config, Message } from '@latitude-data/compiler'

export enum ProviderRules {
  Anthropic = 'anthropic',
  Google = 'google',
  VercelSDK = 'latitude',
  Custom = 'custom',
}

type ProviderRule = { rule: ProviderRules; ruleMessage: string }

export type AppliedRules = {
  rules: ProviderRule[]
  messages: Message[]
  config: Config
}
