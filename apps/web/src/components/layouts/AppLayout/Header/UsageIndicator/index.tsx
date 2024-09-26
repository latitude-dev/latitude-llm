'use client'

import { ReactNode, useMemo } from 'react'

import { WorkspaceUsage } from '@latitude-data/core/browser'
import {
  Badge,
  Button,
  CircularProgress,
  CircularProgressProps,
  Skeleton,
  Text,
} from '@latitude-data/web-ui'
import useWorkspaceUsage from '$/stores/workspaceUsage'
import Link from 'next/link'
import Popover from 'node_modules/@latitude-data/web-ui/src/ds/atoms/Popover'

function UsageIndicatorCircle({
  data,
  isLoading,
  ...props
}: Omit<CircularProgressProps, 'value' | 'color'> & {
  data: WorkspaceUsage | undefined
  isLoading: boolean
}) {
  const ratio = useMemo(() => {
    if (!data) return 0
    if (data.max === 0) return 0
    const actualRatio = (data.max - data.usage) / data.max

    if (actualRatio <= 0) return 0
    if (actualRatio >= 1) return 1

    if (actualRatio < 0.01) return 0.01 // Too low of a ratio makes the circle so small it disappears
    return actualRatio
  }, [data])

  if (isLoading) {
    return (
      <CircularProgress
        value={1}
        color='foregroundMuted'
        className='opacity-25 animate-pulse'
        animateOnMount={false}
        {...props}
      />
    )
  }
  if (ratio <= 0) {
    return <CircularProgress value={1} color='destructive' {...props} />
  }

  return (
    <CircularProgress
      value={ratio || 1}
      color={
        ratio > 0.25
          ? 'primary'
          : ratio === 0
            ? 'destructive'
            : 'warningMutedForeground'
      }
      {...props}
    />
  )
}

function LoadingText({
  isLoading,
  children,
}: {
  isLoading: boolean
  children: ReactNode
}) {
  if (isLoading) {
    return <Skeleton className='w-20 h-4 animate-pulse' />
  }

  return children
}

function descriptionText({ usage, max }: WorkspaceUsage) {
  const ratio = (max - usage) / max

  if (ratio <= 0) {
    return "You've reached the maximum number of runs. Your app will continue working, the Latitude limit reached means you'll no longer be able to run tests, view new logs or evaluation results."
  }
  if (ratio < 0.25) {
    return "You're running low on runs in your current plan. Your app will continue working, the Latitude limit reached means you'll no longer be able to run tests, view new logs or evaluation results."
  }

  return `Your plan has included ${max} runs. You can upgrade your plan to get more runs.`
}

export function UsageIndicator() {
  const { data, isLoading } = useWorkspaceUsage()

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant='ghost' className='hover:bg-muted'>
          <div className='flex flex-row items-center gap-x-2'>
            <UsageIndicatorCircle data={data} isLoading={isLoading} />
            <LoadingText isLoading={isLoading}>
              <Text.H6>
                {data?.usage} / {data?.max}
              </Text.H6>
            </LoadingText>
          </div>
        </Button>
      </Popover.Trigger>
      <Popover.Content
        side='bottom'
        sideOffset={8}
        align='center'
        className='bg-background rounded-md w-80 p-4 shadow-lg border border-border'
      >
        <div className='flex flex-col gap-4'>
          <div className='flex flex-row items-center gap-2'>
            <UsageIndicatorCircle
              data={data}
              size={20}
              isLoading={isLoading}
              backgroundColor='foregroundMuted'
              className='overflow-clip'
            />
            <LoadingText isLoading={isLoading}>
              <div className='flex flex-row w-full items-center gap-2'>
                <Text.H4 color='foreground'>{data?.usage}</Text.H4>
                <Text.H4 color='foregroundMuted' noWrap>
                  {' '}
                  / {data?.max} runs
                </Text.H4>
                <div className='w-full flex items-center justify-end'>
                  <Badge variant='muted'>
                    <Text.H6 color='foregroundMuted'>Team Plan</Text.H6>
                  </Badge>
                </div>
              </div>
            </LoadingText>
          </div>
          {data ? (
            <Text.H6>{descriptionText(data)}</Text.H6>
          ) : (
            <div className='w-full flex flex-col gap-1'>
              <Skeleton className='w-full h-3 animate-pulse' />
              <Skeleton className='w-full h-3 animate-pulse' />
              <Skeleton className='w-[40%] h-3 animate-pulse' />
            </div>
          )}
          <div className='flex flex-row'>
            <Link href='mailto:hello@latitude.so'>
              <Button fancy>Contact us to upgrade</Button>
            </Link>
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>
  )
}
