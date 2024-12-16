import { ProviderApiKey } from '../../../../schema/types'
import { Providers } from '@latitude-data/constants'

export { Providers } from '@latitude-data/constants'

export const DEFAULT_PROVIDER_UNSUPPORTED_MODELS = [
  'gpt-4o',
  'gpt-4o-2024-11-20',
  'gpt-4o-2024-08-06',
  'gpt-4o-2024-05-13',
  'gpt-4o-audio-preview',
  'gpt-4o-audio-preview-2024-10-01',
  'o1-preview',
  'o1-preview-2024-09-12',
]

// NOTE: Key order is important as it determines the default provider model we
// chose when creating a new document
const OPEN_AI_MODELS = {
  'gpt-4o-mini': 'gpt-4o-mini',
  'chatgpt-4o-latest': 'chatgpt-4o-latest',
  'gpt-4': 'gpt-4',
  'gpt-4-0125-preview': 'gpt-4-0125-preview',
  'gpt-4-1106-preview': 'gpt-4-1106-preview',
  'gpt-4-32k': 'gpt-4-32k',
  'gpt-4-turbo': 'gpt-4-turbo',
  'gpt-4-turbo-2024-04-09': 'gpt-4-turbo-2024-04-09',
  'gpt-4o': 'gpt-4o',
  'gpt-4o-2024-11-20': 'gpt-4o-2024-11-20',
  'gpt-4o-2024-05-13': 'gpt-4o-2024-05-13',
  'gpt-4o-2024-08-06': 'gpt-4o-2024-08-06',
  'gpt-4o-mini-2024-07-18': 'gpt-4o-mini-2024-07-18',
  'gpt-4o-audio-preview': 'gpt-4o-audio-preview',
  'gpt-4o-audio-preview-2024-10-01': 'gpt-4o-audio-preview-2024-10-01',
  'o1-mini': 'o1-mini',
  'o1-mini-2024-09-12': 'o1-mini-2024-09-12',
  'o1-preview': 'o1-preview',
  'o1-preview-2024-09-12': 'o1-preview-2024-09-12',
}

export const PROVIDER_MODELS: Partial<
  Record<Providers, Record<string, string>>
> = {
  [Providers.OpenAI]: OPEN_AI_MODELS,
  [Providers.Anthropic]: {
    'claude-3-5-sonnet-latest': 'claude-3-5-sonnet-latest',
    'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-20240620': 'claude-3-5-sonnet-20240620',
    'claude-3-5-haiku-latest': 'claude-3-5-haiku-latest',
    'claude-3-5-haiku-20241022': 'claude-3-5-haiku-20241022',
    'claude-3-opus-latest': 'claude-3-pous-latest',
    'claude-3-opus-20240229': 'claude-3-opus-20240229',
    'claude-3-sonnet-latest': 'claude-3-sonnet-latest',
    'claude-3-sonnet-20240229': 'claude-3-sonnet-20240229',
    'claude-3-haiku-latest': 'claude-3-haiku-latest',
    'claude-3-haiku-20240307': 'claude-3-haiku-20240307',
    'claude-2.1': 'claude-2.1',
  },
  [Providers.Groq]: {
    'llama-3.3-70b-specdec': 'llama-3.3-70b-specdec',
    'llama-3.3-70b-versatile': 'llama-3.3-70b-versatile',
    'llama-3.2-1b-preview': 'llama-3.2-1b-preview',
    'llama-3.2-3b-preview': 'llama-3.2-3b-preview',
    'llama-3.2-11b-vision-preview': 'llama-3.2-11b-vision-preview',
    'llama-3.2-90b-vision-preview': 'llama-3.2-90b-vision-preview',
    'llama-3.1-8b-instant': 'llama-3.1-8b-instant',
    'llama-3.1-70b-specdec': 'llama-3.1-70b-specdec',
    'llama3-70b-8192': 'llama3-70b-8192',
    'llama3-8b-8192': 'llama3-8b-8192',
    'llama-guard-3-8b': 'llama-guard-3-8b',
    'llama3-groq-70b-8192-tool-use-preview':
      'llama3-groq-70b-8192-tool-use-preview',
    'llama3-groq-8b-8192-tool-use-preview':
      'llama3-groq-8b-8192-tool-use-preview',
    'mixtral-8x7b-32768': 'mixtral-8x7b-32768',
    'gemma-7b-it': 'gemma-7b-it',
    'gemma2-9b-it': 'gemma2-9b-it',
  },
  [Providers.Mistral]: {
    'ministral-3b-latest': 'ministral-3b-latest',
    'ministral-3b-2410': 'ministral-3b-2410',
    'ministral-8b-latest': 'ministral-8b-latest',
    'ministral-8b-2410': 'ministral-8b-2410',
    'mistral-small-latest': 'mistral-small-latest',
    'mistral-small-2409': 'mistral-small-2409',
    'mistral-medium-latest': 'mistral-medium-latest',
    'mistral-medium-2312': 'mistral-medium-2312',
    'mistral-large-latest': 'mistral-large-latest',
    'mistral-large-2411': 'mistral-large-2411',
    'mistral-large-2407': 'mistral-large-2407',
    'pixtral-12b-2409': 'pixtral-12b-2409',
    'pixtral-large-latest': 'pixtral-large-latest',
    'pixtral-large-2411': 'pixtral-large-2411',
    'open-codestral-mamba': 'open-codestral-mamba',
    'codestral-latest': 'codestral-latest',
    'codestral-2405': 'codestral-2405',
    'open-mistral-nemo': 'open-mistral-nemo',
    'open-mistral-nemo-2407': 'open-mistral-nemo-2407',
    'open-mistral-7b': 'open-mistral-7b',
    'open-mixtral-8x7b': 'open-mixtral-8x7b',
    'open-mixtral-8x22b': 'open-mixtral-8x22b',
  },
  [Providers.Azure]: OPEN_AI_MODELS,
  [Providers.Google]: {
    // 'gemini-2.0-flash': 'gemini-2.0-flash', Not generally available yet
    // 'gemini-2.0-flash-001': 'gemini-2.0-flash-001', Not generally available yet
    'gemini-1.5-flash': 'gemini-1.5-flash',
    'gemini-1.5-flash-8b': 'gemini-1.5-flash-8b',
    'gemini-1.5-flash-002': 'gemini-1.5-flash-002',
    'gemini-1.5-flash-001': 'gemini-1.5-flash-001',
    'gemini-1.5-pro': 'gemini-1.5-pro',
    'gemini-1.5-pro-002': 'gemini-1.5-pro-002',
    'gemini-1.5-pro-001': 'gemini-1.5-pro-001',
    'gemini-1.0-pro': 'gemini-1.0-pro',
    'gemini-1.0-pro-002': 'gemini-1.0-pro-002',
    'gemini-1.0-pro-001': 'gemini-1.0-pro-001',
    'gemini-1.0-pro-vision': 'gemini-1.0-pro-vision',
    'gemini-1.0-pro-vision-001': 'gemini-1.0-pro-vision-001',
  },
  [Providers.Custom]: {},
}

export const UNSUPPORTED_STREAM_MODELS = [
  'o1-preview',
  'o1-preview-2024-09-12',
  'o1-mini',
  'o1-mini-2024-09-12',
]

export function listModelsForProvider({
  provider,
  name,
  latitudeProvider,
}: {
  provider: Providers
  name?: string
  latitudeProvider?: string
}) {
  const models = PROVIDER_MODELS[provider]
  if (!models) return {}

  if (name && name === latitudeProvider) {
    return Object.fromEntries(
      Object.entries(models).filter(
        ([key]) => !DEFAULT_PROVIDER_UNSUPPORTED_MODELS.includes(key),
      ),
    )
  }

  return models
}

export function findFirstModelForProvider({
  provider,
  latitudeProvider,
}: {
  provider?: ProviderApiKey
  latitudeProvider?: string
}) {
  if (!provider) return undefined

  if (provider.provider === Providers.Custom) {
    return provider.defaultModel || undefined
  }

  const models = Object.values(
    listModelsForProvider({
      provider: provider.provider,
      name: provider.name,
      latitudeProvider: latitudeProvider,
    }),
  )

  if (models.find((model) => model === provider.defaultModel)) {
    return provider.defaultModel || undefined
  }

  return models[0]
}
