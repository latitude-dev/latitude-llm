import { Providers } from '@latitude-data/constants'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { AmazonBedrockConfiguration } from './AmazonBedrock'
import { VertexConfiguration } from './Vertex'
import { OpenAIConfiguration } from './OpenAI'

const PROVIDERS_WITHOUT_API_KEY = [
  Providers.GoogleVertex,
  Providers.AnthropicVertex,
  Providers.AmazonBedrock,
]

export function ProviderConfigurationForm({ provider }: { provider: Providers }) {
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

      {provider === Providers.OpenAI ? <OpenAIConfiguration /> : null}
      {provider === Providers.GoogleVertex ? <VertexConfiguration /> : null}
      {provider === Providers.AnthropicVertex ? <VertexConfiguration /> : null}
      {provider === Providers.AmazonBedrock ? <AmazonBedrockConfiguration /> : null}
    </FormFieldGroup>
  )
}
