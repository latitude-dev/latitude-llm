import { Providers, VercelConfig } from '@latitude-data/constants'
import type { Message } from '@latitude-data/constants/messages'
import { JSONValue, ModelMessage } from 'ai'
import { Provider, Translator } from 'rosetta-ai'
import { toCamelCaseDeep } from '../../../../lib/camelCaseRecursive'
import { captureException } from '../../../../utils/datadogCapture'
import { wrapProviderMetadata } from '../../metadata'
import { applyProviderRules, Props } from './provider'
import {
  extractMessageMetadata,
  getProviderMetadataKey,
} from './providerMetadata'
import { AppliedRules } from './types'

export type VercelConfigWithProviderRules = VercelConfig & {
  providerOptions: {
    [key: string]: Record<string, JSONValue>
  }
}

const translator = new Translator({
  filterEmptyMessages: true,
  providerMetadata: 'preserve',
})

/**
 * Config attributes named after the provider's public API that the Vercel AI
 * SDK exposes under a different name. The SDK validates provider options with
 * a zod schema that silently drops unknown keys, so without these aliases the
 * attribute never reaches the provider.
 *
 * Keys are the metadata keys from PROVIDER_TO_METADATA_KEY, not provider names,
 * so aliases apply to every provider sharing an SDK adapter (e.g. OpenAI and
 * Azure).
 */
const PROVIDER_OPTIONS_ALIASES: Record<string, Record<string, string>> = {
  openai: {
    // https://platform.openai.com/docs/api-reference/chat/create#chat_create-verbosity
    verbosity: 'textVerbosity',
  },
}

function aliasProviderOptions({
  providerKey,
  providerOptions,
}: {
  providerKey: string
  providerOptions: Record<string, JSONValue>
}): Record<string, JSONValue> {
  const aliases = PROVIDER_OPTIONS_ALIASES[providerKey]
  if (!aliases) return providerOptions

  return Object.entries(providerOptions).reduce(
    (acc, [key, value]) => {
      const alias = aliases[key]
      if (!alias) {
        acc[key] = value
        return acc
      }

      if (acc[alias] === undefined) acc[alias] = value

      return acc
    },
    {} as Record<string, JSONValue>,
  )
}

function convertLatitudeMessagesToVercelFormat({
  messages,
  provider,
}: {
  messages: Message[]
  provider: Providers
}): ModelMessage[] {
  const metadated = messages.map((message) =>
    extractMessageMetadata({ message, provider }),
  )

  const translating = translator.safeTranslate(metadated, {
    from: Provider.Promptl,
    to: Provider.VercelAI,
    direction: 'input',
  })
  if (translating.error) captureException(translating.error)
  const translated = (translating.messages ?? []) as ModelMessage[]

  const wrapped = wrapProviderMetadata(translated)

  return wrapped
}

export function applyAllRules({ providerType, messages, config }: Props) {
  let rules: AppliedRules = { rules: [], messages, config }
  rules = applyProviderRules({ providerType, messages, config: rules.config })

  const vercelMessages = convertLatitudeMessagesToVercelFormat({
    messages: rules.messages,
    provider: providerType,
  })

  const providerKey = getProviderMetadataKey(providerType)
  const providerOptions = aliasProviderOptions({
    providerKey,
    providerOptions: toCamelCaseDeep(config) as Record<string, JSONValue>,
  })

  return {
    ...rules,
    messages: vercelMessages,
    config: {
      ...rules.config,
      providerOptions: {
        [providerKey]: providerOptions,
      },
    } as VercelConfigWithProviderRules,
  }
}
