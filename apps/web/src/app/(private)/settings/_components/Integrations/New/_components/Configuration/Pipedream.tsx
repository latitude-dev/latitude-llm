'use client'
import { useConnectToPipedreamApp } from '$/hooks/useConnectToPipedreamApp'
import { IntegrationType } from '@latitude-data/constants'
import { IntegrationConfiguration } from '@latitude-data/core/services/integrations/helpers/schema'
import type { App } from '@pipedream/sdk/browser'
import { forwardRef, useImperativeHandle, useState } from 'react'
import { PipedreamAppCard } from './Pipedream/AppCard'
import { AppSelector } from './Pipedream/AppSelector'

export const PipedreamIntegrationConfiguration = forwardRef<{
  validate: () => Promise<IntegrationConfiguration>
}>((_, ref) => {
  const [app, setApp] = useState<App>()
  const { connect, externalUserId } = useConnectToPipedreamApp(app)

  useImperativeHandle(
    ref,
    () => ({
      validate: async () => {
        if (!app) throw new Error('Please select an app')
        if (!externalUserId) {
          throw new Error(
            'Authentication token not available. Please wait a few seconds and try again.',
          )
        }

        const [connectionId, error] = await connect()
        if (error) throw error

        return {
          type: IntegrationType.Pipedream,
          configuration: {
            appName: app.name_slug,
            connectionId,
            externalUserId,
            authType: app.auth_type,
            oauthAppId: app.id,
            metadata: {
              displayName: app.name,
              imageUrl: app.img_src,
            },
          },
        }
      },
    }),
    [app, connect, externalUserId],
  )

  return (
    <div className='flex flex-col gap-4'>
      <AppSelector value={app} onChange={setApp} isLoading={!externalUserId} />
      <PipedreamAppCard app={app} />
    </div>
  )
})
