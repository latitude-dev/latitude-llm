import type { Config, Message } from '@latitude-data/compiler'

export enum ProviderRules {
  Anthropic = 'anthropic',
  Google = 'google',
  VercelSDK = 'latitude',
  OpenAI = 'openai',
  VertexAntropic = 'vertex_anthropic',
  VertexGoogle = 'vertex_google',
  Custom = 'custom',
  XAI = 'xai',
  AmazonBedrock = 'amazon_bedrock',
  DeepSeek = 'deepseek',
  Perplexity = 'perplexity',
}

type ProviderRule = { rule: ProviderRules; ruleMessage: string }

export type AppliedRules = {
  rules: ProviderRule[]
  messages: Message[]
  config: Config
}
