import { merge } from 'lodash-es'
import { IntegrationType } from '@latitude-data/constants'
import {
  COMMON_INTEGRATION_INPUT_FIELDS_KEYS,
  CommonIntegrationInputKey,
  IntegrationInputSchema,
} from '$/actions/integrations/inputSchema'

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
  acc: IntegrationInputSchema
  namespace: string
}) {
  const tokens = extractTokens({ key, namespace })
  if (!tokens.length) return acc

  const configuration = tokens.reduceRight((inner, token, index) => {
    if (index === tokens.length - 1) {
      return { [token]: value }
    }
    return { [token]: inner }
  }, {}) as IntegrationInputSchema['configuration']

  if (!acc.configuration) return { ...acc, configuration }

  return {
    ...acc,
    configuration: merge(acc.configuration, configuration),
  }
}

const DEFAULT_NAMESPACE = '[configuration]'

export function buildIntegrationPayload({
  formData,
  namespace = DEFAULT_NAMESPACE,
}: {
  formData: FormData
  namespace?: string
}): IntegrationInputSchema {
  return Array.from(formData.entries()).reduce((acc, [key, value]) => {
    if (key === 'type') {
      acc.type = value.toString() as IntegrationType
      return acc as IntegrationInputSchema
    }

    if (COMMON_INTEGRATION_INPUT_FIELDS_KEYS.includes(key)) {
      acc[key as CommonIntegrationInputKey] =
        value.toString() as IntegrationType
      return acc as IntegrationInputSchema
    }

    return buildConfigAttribute({
      namespace,
      key,
      value,
      acc,
    }) as IntegrationInputSchema
  }, {} as IntegrationInputSchema) as IntegrationInputSchema
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
