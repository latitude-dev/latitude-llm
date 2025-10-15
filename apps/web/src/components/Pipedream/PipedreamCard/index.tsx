'use client'
import { usePipedreamApp } from '$/stores/pipedreamApp'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { cn } from '@latitude-data/web-ui/utils'
import type { App } from '@pipedream/sdk/browser'
import Image from 'next/image'
import { ReactNode, useMemo, useState } from 'react'
import {
  PipedreamComponent,
  PipedreamComponentType,
} from '@latitude-data/core/constants'
import { parseMarkdownLinks } from '../utils'

function AppComponent({ component }: { component: PipedreamComponent }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const description = useMemo(
    () => parseMarkdownLinks(component.description),
    [component.description],
  )
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex-1 min-w-0'>
          <Text.H5>{component.name}</Text.H5>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className='text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0'
        >
          {isExpanded ? '− info' : '+ info'}
        </button>
      </div>
      {isExpanded && (
        <Text.H6 color='foregroundMuted' wordBreak='breakWord'>
          <div
            className='[&>a]:underline [&>a]:text-foreground'
            dangerouslySetInnerHTML={{
              __html: description,
            }}
          />
        </Text.H6>
      )}
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
  const { data, isLoading: isLoadingPipedreamApp } = usePipedreamApp(
    app.nameSlug,
  )
  const isLoading = isLoadingPipedreamApp

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
      <AppComponentsCard
        title='Triggers'
        icon='zap'
        isLoading={isLoading}
        components={data?.triggers}
        header={
          isLoading || data?.triggers?.length ? (
            <AppComponentsHeader
              label='triggers'
              isLoading={isLoading}
              count={data?.triggers?.length}
            />
          ) : (
            <Text.H5 color='foregroundMuted'>No triggers available</Text.H5>
          )
        }
      />
    </div>
  )
}

export function PipedreamAppCard({
  app,
  onlyApps = false,
}: {
  app: App | undefined
  onlyApps?: boolean
}) {
  const { data, isLoading: isLoadingPipedreamApp } = usePipedreamApp(
    app?.nameSlug,
  )

  if (!app) return <Text.H5 color='foregroundMuted'>Select an app.</Text.H5>

  const isLoading = onlyApps ? isLoadingPipedreamApp : false

  return (
    <div
      className={cn(
        'w-full flex flex-col gap-4',
        !onlyApps && 'border border-border p-4 rounded-lg',
      )}
    >
      {!onlyApps && (
        <>
          <div className='flex gap-2 items-center'>
            <Image
              src={app.imgSrc}
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
        </>
      )}
      {onlyApps ? (
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
      ) : (
        <AppComponents app={app} />
      )}
    </div>
  )
}
