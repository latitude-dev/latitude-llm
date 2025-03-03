'use client'
import { Input, TextArea } from '@latitude-data/web-ui'
import { buildConfigFieldName } from '../../buildIntegrationPayload'

export function McpServerIntegration() {
  return (
    <div className='flex flex-col gap-4'>
      <Input
        required
        type='text'
        name={buildConfigFieldName({
          fieldNamespace: 'name',
        })}
        label='Name'
        description='A descriptive name for your MCP server.'
        placeholder='My MCP Server'
      />
      <Input
        required
        type='text'
        name={buildConfigFieldName({
          fieldNamespace: 'runCommand',
        })}
        label='MCP Server'
        description='The MCP server to deploy.'
        placeholder='@modelcontextprotocol/slack-server'
      />
      <TextArea
        name={buildConfigFieldName({
          fieldNamespace: 'environmentVariables',
        })}
        label='Environment Variables'
        description='Enter environment variables in KEY=VALUE format, one per line or comma-separated (e.g., API_KEY=abc123, SECRET_TOKEN=xyz456).'
        placeholder='API_KEY=abc123
SECRET_TOKEN=xyz456'
      />
    </div>
  )
}
