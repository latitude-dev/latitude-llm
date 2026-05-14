import { Input } from '@latitude-data/web-ui/atoms/Input'
import { buildConfigFieldName } from '../../../buildProviderPayload'

export function AmazonBedrockConfiguration() {
  return (
    <>
      <Input
        required
        type='text'
        label='Region'
        info='Credentials are resolved through the AWS SDK default credential chain. In ECS, attach an IAM task role with Amazon Bedrock access.'
        name={buildConfigFieldName({
          fieldNamespace: 'region',
        })}
        placeholder='us-east-1'
      />
    </>
  )
}
