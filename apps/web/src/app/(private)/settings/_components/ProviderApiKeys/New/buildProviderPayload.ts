import {
  COMMON_PROVIDER_INPUT_FIELDS_KEYS,
  CommonProviderInputKey,
  ProviderInputSchema,
} from '$/actions/providerApiKeys/inputSchema'
import { Providers } from '@latitude-data/constants'
import { merge } from 'lodash-es'

const CONFIG_PARAM_REGX = /\[([^\]]+)\]/g

function extractTokens({ key, namespace }: { key: string; namespace: string }) {
  if (!key.startsWith(namespace)) return []

  const tokens = [...key.matchAll(CONFIG_PARAM_REGX)].map((match) => match[1])

  const [_configuration, ...rest] = tokens
  return rest.filter((t) => t !== undefined)
}

type ValueOf<T> = T extends IterableIterator<[any, infer V]> ? V : never

function buildConfigAttribute({
  key,
  value,
  acc,
  namespace,
}: {
  key: string
  value: ValueOf<ReturnType<FormData['entries']>>
  acc: ProviderInputSchema
  namespace: string
}) {
  const tokens = extractTokens({ key, namespace })
  if (!tokens.length) return acc

  const configuration = tokens.reduceRight((inner, token, index) => {
    if (index === tokens.length - 1) {
      return { [token]: value }
    }
    return { [token]: inner }
  }, {}) as ProviderInputSchema['configuration']

  if (!acc.configuration) return { ...acc, configuration }

  return {
    ...acc,
    configuration: merge(acc.configuration, configuration),
  }
}

const DEFAULT_NAMESPACE = '[configuration]'

export function buildProviderPayload({
  formData,
  namespace = DEFAULT_NAMESPACE,
}: {
  formData: FormData
  namespace?: string
}): ProviderInputSchema {
  return Array.from(formData.entries()).reduce((acc, [key, value]) => {
    if (key === 'provider') {
      acc.provider = value.toString() as Providers
      return acc as ProviderInputSchema
    }

    if (COMMON_PROVIDER_INPUT_FIELDS_KEYS.includes(key)) {
      acc[key as CommonProviderInputKey] = value.toString()
      return acc as ProviderInputSchema
    }

    return buildConfigAttribute({
      namespace,
      key,
      value,
      acc,
    }) as ProviderInputSchema
  }, {} as ProviderInputSchema) as ProviderInputSchema
}

export function buildConfigFieldName({
  fieldNamespace,
  namespace = DEFAULT_NAMESPACE,
}: {
  fieldNamespace: string
  namespace?: string
}) {
  const field = fieldNamespace.startsWith('[')
    ? fieldNamespace
    : `[${fieldNamespace}]`
  return `${namespace}${field}`
}
