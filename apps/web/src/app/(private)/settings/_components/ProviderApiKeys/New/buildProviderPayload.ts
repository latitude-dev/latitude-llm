import {
  COMMON_PROVIDER_INPUT_FIELDS_KEYS,
  CommonProviderInputKey,
  ProviderInputSchema,
} from '$/actions/providerApiKeys/inputSchema'
import { Providers } from '@latitude-data/constants'

export function buildProviderPayload({
  formData,
}: {
  formData: FormData
}): ProviderInputSchema {
  return Array.from(formData.entries()).reduce((acc, [key, value]) => {
    console.log('KEY: ', key)
    console.log('VALUE: ', value)

    if (key === 'provider') {
      acc.provider = value.toString() as Providers
    }

    if (COMMON_PROVIDER_INPUT_FIELDS_KEYS.includes(key)) {
      acc[key as CommonProviderInputKey] = value.toString()
    }

    return acc
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

