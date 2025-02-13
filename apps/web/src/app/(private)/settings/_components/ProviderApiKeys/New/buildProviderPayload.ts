import {
  COMMON_PROVIDER_INPUT_FIELDS_KEYS,
  CommonProviderInputKey,
  ProviderInputSchema,
} from '$/actions/providerApiKeys/inputSchema'
import { Providers } from '@latitude-data/constants'

const CONFIG_PARAM_REGX = /\[([^\]]+)\]/g
const PROVIDER_VALUES = Object.values(Providers)

const EMPTY_TOKENS = { provider: undefined, tokens: [] as string[] }
function extractTokens(key: string) {
  if (!key.startsWith('[configuration]')) return EMPTY_TOKENS

  let match: RegExpExecArray | null
  const tokens: string[] = []
  while ((match = CONFIG_PARAM_REGX.exec(key)) !== null) {
    if (match[1]) {
      tokens.push(match[1])
    }
  }

  console.log({ tokens })

  // Check for any trailing part (non-bracketed) after the last match.
  if (CONFIG_PARAM_REGX.lastIndex < key.length) {
    const remaining = key.substring(CONFIG_PARAM_REGX.lastIndex)
    if (remaining) tokens.push(remaining)
  }

  // Remove the first token ('configuration')
  const [_configuration, provider, ...rest] = tokens

  if (!provider) return EMPTY_TOKENS
  if (!PROVIDER_VALUES.includes(provider as Providers)) return EMPTY_TOKENS

  return { provider: provider as Providers, tokens: rest }
}

type ValueOf<T> = T extends IterableIterator<[any, infer V]> ? V : never

function buildConfigAttribute({
  key,
  value,
  usedProvider,
  acc,
}: {
  key: string
  value: ValueOf<ReturnType<FormData['entries']>>
  usedProvider: Providers
  acc: ProviderInputSchema
}) {
  if (usedProvider !== Providers.GoogleVertex) return acc

  console.log({ key, value, acc })
  const configuration = acc.configuration ?? {}
  const { provider, tokens } = extractTokens(key)

  if (!provider || !tokens.length) return acc

  console.log({ provider, tokens, key, value })
}

export function buildProviderPayload({
  formData,
  provider,
}: {
  formData: FormData
  provider: Providers
}): ProviderInputSchema {
  return Array.from(formData.entries()).reduce((acc, [key, value]) => {
    if (key === 'provider') {
      acc.provider = value.toString() as Providers
    }

    if (COMMON_PROVIDER_INPUT_FIELDS_KEYS.includes(key)) {
      acc[key as CommonProviderInputKey] = value.toString()
    }

    return buildConfigAttribute({ key, value, usedProvider: provider, acc })
  }, {} as ProviderInputSchema)
}

export function buildConfigFieldName({
  provider,
  fieldNamespace,
}: {
  provider: Providers
  fieldNamespace: string
}) {
  return `[configuration][${provider}][${fieldNamespace}]`
}
