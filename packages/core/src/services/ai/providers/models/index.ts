import { ProviderApiKey } from '../../../../schema/types'

export enum Providers {
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  Groq = 'groq',
  Mistral = 'mistral',
  Azure = 'azure',
  Google = 'google',
  Custom = 'custom',
}

export const DEFAULT_PROVIDER_UNSUPPORTED_MODELS = [
  'gpt-4o',
  'gpt-4o-2024-08-06',
  'gpt-4o-2024-05-13',
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
  'gpt-4o-2024-05-13': 'gpt-4o-2024-05-13',
  'gpt-4o-2024-08-06': 'gpt-4o-2024-08-06',
  'gpt-4o-mini-2024-07-18': 'gpt-4o-mini-2024-07-18',
  'o1-mini': 'o1-mini',
  'o1-mini-2024-09-12	': 'o1-mini-2024-09-12',
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
    'claude-3-sonnet-20240229': 'claude-3-sonnet-20240229',
    'claude-3-opus-latest': 'claude-3-pous-latest',
    'claude-3-opus-20240229': 'claude-3-opus-20240229',
    'claude-3-haiku-latest': 'claude-3-haiku-latest',
    'claude-3-haiku-20240307': 'claude-3-haiku-20240307',
    'claude-2.1': 'claude-2.1',
  },
  [Providers.Groq]: {
    'gemma-7b-it': 'gemma-7b-it',
    'gemma2-9b-it': 'gemma2-9b-it',
    // 'llama-3.1-405b-reasoning': N/A
    // 'llama-3.1-70b-versatile': N/A
    // 'llama-3.1-8b-instant': N/A
    'llama3-70b-8192': 'llama3-70b-8192',
    'llama3-8b-8192': 'llama3-8b-8192',
    'llama-guard-3-8b': 'llama-guard-3-8b',
    'llama3-groq-70b-8192-tool-use-preview':
      'llama3-groq-70b-8192-tool-use-preview',
    'llama3-groq-8b-8192-tool-use-preview':
      'llama3-groq-8b-8192-tool-use-preview',
    'mixtral-8x7b-32768': 'mixtral-8x7b-32768',
  },
  [Providers.Mistral]: {
    'open-mistral-nemo-2407': 'open-mistral-nemo-2407',
    'mistral-large-2407': 'mistral-large-2407',
    'codestral-2405': 'codestral-2405',
    'open-mistral-7b': 'open-mistral-7b',
    'open-mixtral-8x7b': 'open-mixtral-8x7b',
    'open-mixtral-8x22b': 'open-mixtral-8x22b',
    'mistral-small-latest': 'mistral-small-latest',
    'mistral-medium-latest': 'mistral-medium-latest',
  },
  [Providers.Azure]: OPEN_AI_MODELS,
  [Providers.Google]: {
    'gemini-1.5-flash': 'gemini-1.5-flash',
    'gemini-1.5-flash-8b': 'gemini-1.5-flash-8b',
    'gemini-1.5-pro': 'gemini-1.5-pro',
    'gemini-1.0-pro': 'gemini-1.0-pro',
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
