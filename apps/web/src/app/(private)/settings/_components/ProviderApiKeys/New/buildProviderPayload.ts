import {
  COMMON_PROVIDER_INPUT_FIELDS_KEYS,
  CommonProviderInputKey,
  ProviderInputSchema,
} from '$/actions/providerApiKeys/inputSchema'
import { Providers } from '@latitude-data/constants'

const CONFIG_PARAM_REGX = /\[([^\]]+)\]/g

function extractTokens({ key, namespace }: { key: string; namespace: string }) {
  if (!key.startsWith(namespace)) return []

  const tokens = [...key.matchAll(CONFIG_PARAM_REGX)].map((match) => match[1])

  const [_configuration, ...rest] = tokens
  return rest.filter(t => t !== undefined)
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
  const configuration = acc.configuration ?? {}
  const tokens = extractTokens({ key, namespace })

  if (!tokens.length) return acc

  const firstToken = tokens[0]
  if (!firstToken) return acc

  console.log('TOKENS', tokens)
  if (tokens.length === 1) {
    // @ts-ignore
    configuration[firstToken] = value
    return acc
  }

  const config = tokens.reduce((config, path) => {
    const [key, subKey] = path
    if (!key) return config

    if (subKey) {
      return {
        ...config,
        [key]: {
          ...(config[key] || {}),
          [subKey]: subKey,
        },
      }
    }
    return { ...config, [key]: key }
  }, {})
  // @ts-ignore
  /* const existingValue = configuration[firstToken] ?? {} */
  /**/
  /* const newConfiguration = tokens.slice(1).reduce((acc, token, index) => { */
  /*   if (index === tokens.length - 2) { */
  /*     acc[token] = value */
  /*   } else { */
  /*     acc[token] = {} */
  /*   } */
  /**/
  /*   return acc */
  /* }, existingValue) */
  /**/
  /* // @ts-ignore */
  /* acc.configuration[firstToken] = newConfiguration */
  return acc
}

const DEFAULT_NAMESPACE = '[configuration]'

export function buildProviderPayload({
  formData,
  namespace = DEFAULT_NAMESPACE,
}: {
  formData: FormData
  provider: Providers
  namespace?: string
}): ProviderInputSchema {
  return Array.from(formData.entries()).reduce((acc, [key, value]) => {
    if (key === 'provider') {
      acc.provider = value.toString() as Providers
    }

    if (COMMON_PROVIDER_INPUT_FIELDS_KEYS.includes(key)) {
      acc[key as CommonProviderInputKey] = value.toString()
    }

    return buildConfigAttribute({ namespace, key, value, acc })
  }, {} as ProviderInputSchema)
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
