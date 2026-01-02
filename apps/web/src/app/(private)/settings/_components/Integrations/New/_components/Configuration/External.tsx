'use client'
import { IntegrationType } from '@latitude-data/constants'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { forwardRef, useImperativeHandle, useState } from 'react'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { pingCustomMcpAction } from '$/actions/integrations/pingCustomMcpServer'
import { IntegrationConfiguration } from '@latitude-data/core/services/integrations/helpers/schema'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'

export const ExternalIntegrationConfiguration = forwardRef<
  {
    validate: () => Promise<IntegrationConfiguration>
  },
  {}
>((_, ref) => {
  const { execute, isPending } = useLatitudeAction(pingCustomMcpAction)
  const [url, setUrl] = useState<string>('')
  const [useOAuth, setUseOAuth] = useState<boolean>(false)

  useImperativeHandle(
    ref,
    () => ({
      validate: async () => {
        if (!url) throw new Error('URL is required')

        if (!useOAuth) {
          const [_, error] = await execute({ url })
          if (error) throw error
        }

        return {
          type: IntegrationType.ExternalMCP,
          configuration: {
            url,
            useOAuth,
          },
        }
      },
    }),
    [url, useOAuth, execute],
  )

  return (
    <div className='flex flex-col gap-4'>
      <Input
        required
        name='url'
        label='URL'
        description='URL to your Custom MCP Server.'
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      {isPending && (
        <div className='flex items-center gap-2'>
          <Icon name='loader' spin color='foregroundMuted' />
          <Text.H5 color='foregroundMuted'>Testing connection...</Text.H5>
        </div>
      )}
      <Checkbox
        checked={useOAuth}
        onCheckedChange={(checked) => setUseOAuth(checked === true)}
        name='useOAuth'
        label='Use OAuth authentication'
        description='Enable if the MCP server requires OAuth authentication. Uses dynamic client registration (RFC 7591).'
      />
      {useOAuth && (
        <div className='flex flex-col gap-4 pl-6 border-l-2 border-muted'>
          <Text.H5 color='foregroundMuted'>
            OAuth authentication will use dynamic client registration. The
            connection will be authenticated when creating the integration.
          </Text.H5>
        </div>
      )}
    </div>
  )
})
