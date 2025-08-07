'use client'
import { IntegrationType } from '@latitude-data/constants'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { forwardRef, useImperativeHandle, useState } from 'react'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { pingCustomMcpAction } from '$/actions/integrations/pingCustomMcpServer'
import { IntegrationConfiguration } from '@latitude-data/core/services/integrations/helpers/schema'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export const ExternalIntegrationConfiguration = forwardRef<
  {
    validate: () => Promise<IntegrationConfiguration>
  },
  {}
>((_, ref) => {
  const { execute, isPending } = useLatitudeAction(pingCustomMcpAction)
  const [url, setUrl] = useState<string>('')

  useImperativeHandle(
    ref,
    () => ({
      validate: async () => {
        if (!url) throw new Error('URL is required')
        const [_, error] = await execute({ url })

        if (error) throw error
        return { type: IntegrationType.ExternalMCP, configuration: { url } }
      },
    }),
    [url, execute],
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
    </div>
  )
})
