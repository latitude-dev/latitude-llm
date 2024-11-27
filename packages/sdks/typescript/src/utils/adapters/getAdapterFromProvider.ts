import { Providers } from '@latitude-data/core/browser'
import {
  AdapterMessageType,
  Adapters,
  Message,
  ProviderAdapter,
} from '@latitude-data/promptl'

export function getPromptlAdapterFromProvider<
  M extends AdapterMessageType = Message,
>(provider?: Providers): ProviderAdapter<M> {
  switch (provider) {
    case Providers.OpenAI:
      return Adapters.openai as ProviderAdapter<M>
    case Providers.Anthropic:
      return Adapters.anthropic as ProviderAdapter<M>
    default:
      return Adapters.openai as ProviderAdapter<M>
  }
}
