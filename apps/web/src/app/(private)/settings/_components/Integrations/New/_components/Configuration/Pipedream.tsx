'use client'
import { useConnectToPipedreamApp } from '$/hooks/useConnectToPipedreamApp'
import Image from 'next/image'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { forwardRef, useImperativeHandle, useState } from 'react'
import { AppSelector } from '../AppSelector'
import type { App, V1Component } from '@pipedream/sdk/browser'
import { IntegrationConfiguration } from '@latitude-data/core/services/integrations/helpers/schema'
import { IntegrationType } from '@latitude-data/constants'
import { usePipedreamApp } from '$/hooks/usePipedreamApp'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'

function AppTool({ component }: { component: V1Component }) {
  return (
    <div className='flex flex-col gap-2'>
      <Text.H5>{component.name}</Text.H5>
      <Text.H6 color='foregroundMuted'>{component.description}</Text.H6>
    </div>
  )
}

function AppToolSkeleton() {
  return (
    <div className='flex flex-col gap-2'>
      <Skeleton className='w-1/2' height='h5' />
      <Skeleton className='w-full' height='h6' />
    </div>
  )
}

function AppTools({ app }: { app: App }) {
  const { data, isLoading } = usePipedreamApp(app.name_slug)
  return (
    <CollapsibleBox
      title='Tools'
      icon='blocks'
      collapsedContentHeader={
        <div className='flex w-full items-center justify-end'>
          {isLoading ? (
            <Skeleton className='w-24' height='h5' />
          ) : (
            <Badge variant='accent'>{data?.components.length ?? 0} tools</Badge>
          )}
        </div>
      }
      expandedContentHeader={
        <div className='flex w-full items-center justify-end'>
          {isLoading ? (
            <Skeleton className='w-24' height='h5' />
          ) : (
            <Badge variant='accent'>{data?.components.length ?? 0} tools</Badge>
          )}
        </div>
      }
      expandedContent={
        <div className='flex flex-col gap-4'>
          {isLoading ? (
            <>
              <AppToolSkeleton />
              <AppToolSkeleton />
              <AppToolSkeleton />
              <AppToolSkeleton />
            </>
          ) : (
            data?.components.map((component) => (
              <AppTool key={component.name} component={component} />
            ))
          )}
        </div>
      }
    />
  )
}

function PipedreamAppCard({ app }: { app: App | undefined }) {
  if (!app) return <Text.H5 color='foregroundMuted'>Select an app.</Text.H5>

  return (
    <div className='w-full flex flex-col gap-4 border border-border p-4 rounded-lg'>
      <div className='flex gap-2 items-center'>
        <Image src={app.img_src} alt={app.name} width={24} height={24} />
        <Text.H4>{app.name}</Text.H4>
      </div>
      <Text.H5 color='foregroundMuted'>{app.description}</Text.H5>
      <div className='flex gap-2'>
        {app.categories.map((category) => (
          <Badge key={category} variant='outline'>
            {category}
          </Badge>
        ))}
      </div>
      <AppTools app={app} />
    </div>
  )
}

export const PipedreamIntegrationConfiguration = forwardRef<{
  validate: () => Promise<IntegrationConfiguration>
}>((_, ref) => {
  const [app, setApp] = useState<App>()
  const { connect, externalUserId } = useConnectToPipedreamApp(app)

  useImperativeHandle(ref, () => ({
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
  }))

  return (
    <div className='flex flex-col gap-4'>
      <AppSelector value={app} onChange={setApp} isLoading={!externalUserId} />
      <PipedreamAppCard app={app} />
    </div>
  )
})
