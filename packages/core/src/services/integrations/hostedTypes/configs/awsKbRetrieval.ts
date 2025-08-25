import type { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description:
    'Integration for retrieving information from the AWS Knowledge Base using the Bedrock Agent Runtime.',
  command: npxCommand({
    package: '@modelcontextprotocol/server-aws-kb-retrieval',
  }),
  env: {
    AWS_ACCESS_KEY_ID: {
      label: 'AWS Access Key ID',
      description: 'The AWS access key ID',
      placeholder: 'AKIA...',
      required: true,
    },
    AWS_SECRET_ACCESS_KEY: {
      label: 'AWS Secret Access Key',
      description: 'The AWS secret access key',
      placeholder: '********...',
      required: true,
    },
    AWS_REGION: {
      label: 'AWS Region',
      description: 'The AWS region',
      placeholder: 'us-west-2',
      required: true,
    },
  },
  envSource: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html',
} as HostedIntegrationConfig
