import { HostedIntegrationConfig } from '../types'
import { npxCommand } from '../utils'

export default {
  description:
    'Integration for retrieving information from the AWS Knowledge Base using the Bedrock Agent Runtime.',
  command: npxCommand({
    package: '@modelcontextprotocol/server-aws-kb-retrieval',
  }),
  env: {
    AWS_REGION: {
      label: 'AWS Region',
      description: 'The AWS region',
      placeholder: 'us-west-2',
      required: true,
    },
  },
  envSource:
    'https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html',
} as HostedIntegrationConfig
