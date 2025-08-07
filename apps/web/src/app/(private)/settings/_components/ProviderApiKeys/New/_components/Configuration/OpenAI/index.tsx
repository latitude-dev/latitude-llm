import { buildConfigFieldName } from '$/app/(private)/settings/_components/ProviderApiKeys/New/buildProviderPayload'
import { OPENAI_PROVIDER_ENDPOINTS } from '@latitude-data/constants'
import { Select, type SelectOption } from '@latitude-data/web-ui/atoms/Select'

const ENDPOINT_OPTIONS = OPENAI_PROVIDER_ENDPOINTS.reduce((acc, endpoint) => {
  acc.push({
    label: endpoint,
    value: endpoint,
  })
  return acc
}, [] as SelectOption[])

export function OpenAIConfiguration() {
  return (
    <Select
      label='Endpoint'
      name={buildConfigFieldName({ fieldNamespace: 'endpoint' })}
      defaultValue={OPENAI_PROVIDER_ENDPOINTS[0]}
      options={ENDPOINT_OPTIONS}
      description='Oldest version is "chat_completions" but if you want to use OpenAI built-in tools you need to use "responses" endpoint'
    />
  )
}
