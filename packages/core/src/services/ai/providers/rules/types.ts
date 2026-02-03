import type { Config, Message } from '@latitude-data/constants/messages'
import { PartialConfig } from '../../helpers'

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

type AnyConfig = Config | PartialConfig
export type AppliedRules = {
  rules: ProviderRule[]
  messages: Message[]
  config: AnyConfig & {
    // This is here because provider configs are not typed
    // in Vercel SDK so we don't exactly what are passed.
    // We just pass everything under `config.providerOptions[NAME_OF_PROVIDER]`
    [key: string]: unknown
  }
}
