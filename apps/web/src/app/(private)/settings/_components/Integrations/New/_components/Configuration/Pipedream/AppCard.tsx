'use client'
import Image from 'next/image'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import type { App, V1Component } from '@pipedream/sdk/browser'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import {
  PipedreamComponent,
  PipedreamComponentType,
} from '@latitude-data/core/browser'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { ReactNode } from 'react'

function AppComponent({ component }: { component: V1Component }) {
  return (
    <div className='flex flex-col gap-2'>
      <Text.H5>{component.name}</Text.H5>
      <Text.H6 color='foregroundMuted' wordBreak='breakWord'>
        {component.description}
      </Text.H6>
    </div>
  )
}

function AppComponentSkeleton() {
  return (
    <div className='flex flex-col gap-2'>
      <Skeleton className='w-1/2' height='h5' />
      <Skeleton className='w-full' height='h6' />
    </div>
  )
}

function AppComponentsHeader({
  count,
  label,
  isLoading,
}: {
  count: number | undefined
  label: string
  isLoading: boolean
}) {
  if (isLoading) {
    return <Skeleton className='w-24' height='h5' />
  }

  return (
    <Badge variant='accent'>
      {count ?? 0} {label}
    </Badge>
  )
}

function AppComponentsCard<C extends PipedreamComponentType>({
  title,
  icon,
  isLoading,
  components,
  header,
}: {
  title: string
  icon: IconName
  isLoading: boolean
  components?: PipedreamComponent<C>[]
  header: ReactNode
}) {
  return (
    <CollapsibleBox
      title={title}
      icon={icon}
      collapsedContentHeader={
        <div className='flex w-full items-center justify-end'>{header}</div>
      }
      expandedContentHeader={
        <div className='flex w-full items-center justify-end'>{header}</div>
      }
      expandedContent={
        <div className='flex flex-col gap-4'>
          {isLoading ? (
            <>
              <AppComponentSkeleton />
              <AppComponentSkeleton />
              <AppComponentSkeleton />
              <AppComponentSkeleton />
            </>
          ) : (
            components?.map((component) => (
              <AppComponent key={component.name} component={component} />
            ))
          )}
        </div>
      }
    />
  )
}

function AppComponents({ app }: { app: App }) {
  const { data, isLoading } = usePipedreamApp(app.name_slug)

  return (
    <div className='flex flex-col gap-4'>
      <AppComponentsCard
        title='Tools'
        icon='blocks'
        isLoading={isLoading}
        components={data?.tools}
        header={
          isLoading || data?.tools?.length ? (
            <AppComponentsHeader
              label='tools'
              isLoading={isLoading}
              count={data?.tools?.length}
            />
          ) : (
            <Text.H5 color='foregroundMuted'>No tools available</Text.H5>
          )
        }
      />
    </div>
  )
}

export function PipedreamAppCard({ app }: { app: App | undefined }) {
  if (!app) return <Text.H5 color='foregroundMuted'>Select an app.</Text.H5>

  return (
    <div className='w-full flex flex-col gap-4 border border-border p-4 rounded-lg'>
      <div className='flex gap-2 items-center'>
        <Image
          src={app.img_src}
          alt={app.name}
          width={24}
          height={24}
          unoptimized
        />
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
      <AppComponents app={app} />
    </div>
  )
}
