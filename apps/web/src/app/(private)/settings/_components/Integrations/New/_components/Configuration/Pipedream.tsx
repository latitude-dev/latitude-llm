'use client'
import { useConnectToPipedreamApp } from '$/hooks/useConnectToPipedreamApp'
import { forwardRef, useImperativeHandle, useState } from 'react'
import { AppSelector } from './Pipedream/AppSelector'
import type { App } from '@pipedream/sdk/browser'
import { IntegrationConfiguration } from '@latitude-data/core/services/integrations/helpers/schema'
import { IntegrationType } from '@latitude-data/constants'
import { PipedreamAppCard } from './Pipedream/AppCard'

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
            appName: app.nameSlug,
            connectionId,
            externalUserId,
            authType: app.authType ?? 'none',
            oauthAppId: app.id,
            metadata: {
              displayName: app.name,
              imageUrl: app.imgSrc,
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
