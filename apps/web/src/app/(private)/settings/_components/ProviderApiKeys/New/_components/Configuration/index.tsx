import { buildConfigFieldName } from '$/app/(private)/settings/_components/ProviderApiKeys/New/buildProviderPayload'
import { Providers } from '@latitude-data/constants'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'

const PROVIDERS_WITHOUT_API_KEY = [
  Providers.GoogleVertex,
  Providers.AnthropicVertex,
]

function VertexConfiguration() {
  return (
    <>
      <Input
        required
        type='text'
        label='Project name'
        info='The Google Cloud project ID that you want to use for the API calls'
        name={buildConfigFieldName({
          fieldNamespace: 'project',
        })}
        placeholder='project-1234'
      />
      <Input
        required
        type='text'
        label='Location'
        info='The Google Cloud location that you want to use for the API calls, e.g. us-central1'
        name={buildConfigFieldName({
          fieldNamespace: 'location',
        })}
        placeholder='us-central1, us-west1, etc.'
      />
      <Input
        required
        type='text'
        label='Client Email'
        info='The client email from the service account JSON file'
        name={buildConfigFieldName({
          fieldNamespace: '[googleCredentials][clientEmail]',
        })}
      />
      <Input
        required
        type='text'
        label='Private Key ID'
        info='The private key ID from the service account JSON file.'
        name={buildConfigFieldName({
          fieldNamespace: '[googleCredentials][privateKeyId]',
        })}
      />
      <TextArea
        required
        label='Private Key'
        info='The private key from the service account JSON file.'
        name={buildConfigFieldName({
          fieldNamespace: '[googleCredentials][privateKey]',
        })}
      />
    </>
  )
}

export function ProviderConfigurationForm({
  provider,
}: {
  provider: Providers
}) {
  return (
    <FormFieldGroup label='Provider Configuration' layout='vertical'>
      {!PROVIDERS_WITHOUT_API_KEY.includes(provider) ? (
        <Input
          required
          type='text'
          name='token'
          label='API Key'
          placeholder='sk-0dfdsn23bm4m23n4MfB'
        />
      ) : null}

      {provider === Providers.Custom ? (
        <Input
          required
          type='text'
          name='url'
          label='URL'
          description='URL to your OpenAI compatible API.'
          placeholder='http://localhost:11434/v1'
        />
      ) : null}

      {provider === Providers.GoogleVertex ? <VertexConfiguration /> : null}
      {provider === Providers.AnthropicVertex ? <VertexConfiguration /> : null}
    </FormFieldGroup>
  )
}
