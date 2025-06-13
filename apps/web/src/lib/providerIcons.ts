import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Providers } from '@latitude-data/core/browser'

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
