import { Providers } from '@latitude-data/core/browser'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'

export const ICON_BY_LLM_PROVIDER: Record<Providers, IconName> = {
  [Providers.OpenAI]: 'openai',
  [Providers.Anthropic]: 'anthropic',
  [Providers.Groq]: 'groq',
  [Providers.Mistral]: 'mistral',
  [Providers.Azure]: 'azure',
  [Providers.Google]: 'googleGemini',
  [Providers.GoogleVertex]: 'googleVertex',
  [Providers.AnthropicVertex]: 'anthropic',
  [Providers.XAI]: 'xai',
  [Providers.AmazonBedrock]: 'amazonBedrock',
  [Providers.DeepSeek]: 'deepSeek',
  [Providers.Perplexity]: 'perplexity',
  [Providers.Custom]: 'settings',
}

export const LABEL_BY_LLM_PROVIDER: Record<Providers, string> = {
  [Providers.OpenAI]: 'OpenAI',
  [Providers.Anthropic]: 'Anthropic',
  [Providers.Groq]: 'Groq',
  [Providers.Mistral]: 'Mistral',
  [Providers.Azure]: 'Azure',
  [Providers.Google]: 'Google Gemini',
  [Providers.GoogleVertex]: 'Google Vertex',
  [Providers.AnthropicVertex]: 'Anthropic',
  [Providers.XAI]: 'xAI',
  [Providers.AmazonBedrock]: 'Amazon Bedrock',
  [Providers.DeepSeek]: 'DeepSeek',
  [Providers.Perplexity]: 'Perplexity',
  [Providers.Custom]:
    'Custom - OpenAI Compatible (e.g OpenRouter, LM Studio, ...)',
}
