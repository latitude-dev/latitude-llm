'use client'
import { IntegrationType, McpTool } from '@latitude-data/constants'
import {
  Input,
  FormFieldGroup,
  Button,
  Text,
  Alert,
} from '@latitude-data/web-ui'
import { buildConfigFieldName } from '../../buildIntegrationPayload'
import { useState } from 'react'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { pingCustomMcpAction } from '$/actions/integrations/pingCustomMcpServer'

export function IntegrationConfigurationForm({
  integrationType,
}: {
  integrationType: IntegrationType
}) {
  const [url, setUrl] = useState('')
  const [toolList, setToolList] = useState<McpTool[]>()
  const [error, setError] = useState<Error>()
  const { execute, isPending } = useLatitudeAction(pingCustomMcpAction, {
    onSuccess: ({ data }: { data: McpTool[] }) => {
      setError(undefined)
      setToolList(data)
    },
    onError: (data) => {
      setToolList(undefined)
      setError(data.err)
    },
  })

  return (
    <FormFieldGroup label='Integration Configuration' layout='vertical'>
      {integrationType === IntegrationType.CustomMCP ? (
        <div className='flex flex-col gap-2'>
          <div className='flex flex-row gap-2 items-end'>
            <Input
              required
              type='text'
              name={buildConfigFieldName({
                fieldNamespace: 'url',
              })}
              label='URL'
              description='URL to your Custom MCP Server.'
              info='The URL to your Custom MCP Server.'
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button
              variant='outline'
              onClick={() => execute({ url })}
              disabled={isPending || !url.length}
              iconProps={isPending ? { name: 'loader', spin: true } : undefined}
            >
              <Text.H5 noWrap>
                {isPending ? 'Testing...' : 'Test Connection'}
              </Text.H5>
            </Button>
          </div>
          {error && (
            <Alert
              variant='destructive'
              title={error.name}
              description={error.message}
            />
          )}
          {toolList && (
            <Alert
              variant='default'
              title='Connection successful'
              description={`${toolList.length} tools available`}
            />
          )}
        </div>
      ) : null}
    </FormFieldGroup>
  )
}
