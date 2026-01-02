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
  const [oauthClientId, setOAuthClientId] = useState<string>('')
  const [oauthClientSecret, setOAuthClientSecret] = useState<string>('')
  const [oauthScope, setOAuthScope] = useState<string>('')

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
            oauth: useOAuth
              ? {
                  clientId: oauthClientId || undefined,
                  clientSecret: oauthClientSecret || undefined,
                  scope: oauthScope || undefined,
                }
              : undefined,
          },
        }
      },
    }),
    [url, useOAuth, oauthClientId, oauthClientSecret, oauthScope, execute],
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
        description='Enable if the MCP server requires OAuth authentication.'
      />
      {useOAuth && (
        <div className='flex flex-col gap-4 pl-6 border-l-2 border-muted'>
          <Text.H5 color='foregroundMuted'>
            OAuth credentials are optional for servers that support dynamic
            client registration. Provide them if your server requires
            pre-registered clients.
          </Text.H5>
          <Input
            name='oauthClientId'
            label='Client ID (optional)'
            description='OAuth client ID if pre-registered with the server.'
            value={oauthClientId}
            onChange={(e) => setOAuthClientId(e.target.value)}
          />
          <Input
            name='oauthClientSecret'
            label='Client Secret (optional)'
            description='OAuth client secret if pre-registered with the server.'
            type='password'
            value={oauthClientSecret}
            onChange={(e) => setOAuthClientSecret(e.target.value)}
          />
          <Input
            name='oauthScope'
            label='Scope (optional)'
            description='OAuth scope to request (e.g., "mcp:tools mcp:resources").'
            value={oauthScope}
            onChange={(e) => setOAuthScope(e.target.value)}
          />
        </div>
      )}
    </div>
  )
})
