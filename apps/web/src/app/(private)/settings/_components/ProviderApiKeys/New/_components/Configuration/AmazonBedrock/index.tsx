import { Input } from '@latitude-data/web-ui/atoms/Input'
import { buildConfigFieldName } from '../../../buildProviderPayload'

export function AmazonBedrockConfiguration() {
  return (
    <>
      <Input
        required
        type='text'
        label='Access Key ID'
        info='The Amazon Bedrock API Key'
        name={buildConfigFieldName({
          fieldNamespace: 'accessKeyId',
        })}
        placeholder='sk-0dfdsn23bm4m23n4MfB'
      />
      <Input
        required
        type='text'
        label='Secret Access Key'
        info='The Amazon Bedrock API Secret'
        name={buildConfigFieldName({
          fieldNamespace: 'secretAccessKey',
        })}
        placeholder='sk-0dfdsn23bm4m23n4MfB'
      />
      <Input
        required
        type='text'
        label='Region'
        info='The Amazon Bedrock region'
        name={buildConfigFieldName({
          fieldNamespace: 'region',
        })}
        placeholder='us-east-1'
      />
    </>
  )
}
