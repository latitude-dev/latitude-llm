import { buildConfigFieldName } from '$/app/(private)/settings/_components/ProviderApiKeys/New/buildProviderPayload'
import { OPENAI_PROVIDER_ENDPOINTS } from '@latitude-data/constants'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'

const CURRENT_ENDPOINT = OPENAI_PROVIDER_ENDPOINTS[0] // responses
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
      defaultValue={CURRENT_ENDPOINT}
      options={ENDPOINT_OPTIONS}
      description='"responses" is the new standard endpoint for OpenAI text completions. "chat_completions" is deprecated but still supported for backwards compatibility.'
    />
  )
}
