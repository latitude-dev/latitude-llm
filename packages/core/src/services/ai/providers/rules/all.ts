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
  const providerOptions = toCamelCaseDeep(config)

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
