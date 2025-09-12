import { buildConfigFieldName } from '$/app/(private)/settings/_components/ProviderApiKeys/New/buildProviderPayload'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'

export function VertexConfiguration() {
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
      <Input
        type='text'
        label='Base URL (Optional)'
        info='Base URL for the Google Vertex API calls e.g. to use proxy servers. By default, it is constructed using the location and project.'
        name={buildConfigFieldName({
          fieldNamespace: 'baseUrl',
        })}
        placeholder='https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google'
      />
    </>
  )
}
