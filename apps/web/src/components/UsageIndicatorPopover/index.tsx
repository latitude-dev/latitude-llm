'use client'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import {
  CircularProgress,
  CircularProgressProps,
} from '@latitude-data/web-ui/atoms/CircularProgress'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ReactNode, useMemo } from 'react'
import { FREE_PLANS, SubscriptionPlan } from '@latitude-data/core/plans'
import { Quota, WorkspaceUsage } from '@latitude-data/core/constants'

export function SubscriptionBadge({
  subscription: { name, plan },
  showPlanSlug = false,
}: {
  showPlanSlug?: boolean
  subscription: {
    name: string
    plan: SubscriptionPlan
  }
}) {
  const isFree = FREE_PLANS.includes(plan)
  return (
    <Badge variant={isFree ? 'muted' : 'success'}>
      {showPlanSlug ? plan : name}
    </Badge>
  )
}

function tracesDescription({ ratio, max }: { ratio: number; max: Quota }) {
  if (max === 'unlimited') {
    return 'Your plan includes unlimited traces. Enjoy!'
  }

  if (ratio <= 0) {
    return "You've reached the maximum number of traces. Your app will continue working, the Latitude limit reached means you'll no longer be able to run tests, view new logs or evaluation results."
  }
  if (ratio < 0.25) {
    return "You're running low on traces in your current plan. Your app will continue working, the Latitude limit reached means you'll no longer be able to run tests, view new logs or evaluation results."
  }

  return `Your plan includes ${max} traces. You can upgrade your plan to get more traces.`
}

function membersDescription({
  members,
  maxMembers,
}: {
  members: number
  maxMembers: Quota
}) {
  if (maxMembers === 'unlimited') {
    return 'Your plan includes unlimited members. Invite as many as you need!'
  }

  if (members >= maxMembers) {
    return `You have reached the maximum number of members for your current plan. (${maxMembers} members allowed)`
  }

  return `Your plan includes ${maxMembers} members. You can upgrade your plan to get more members.`
}

function UsageIndicatorCircle({
  workspaceUsage,
  isLoading,
  overlimits,
  ...props
}: Omit<CircularProgressProps, 'value' | 'color'> & {
  workspaceUsage: WorkspaceUsage | undefined
  isLoading: boolean
  overlimits?: boolean
}) {
  const ratio = useMemo(() => {
    if (!workspaceUsage) return 1
    if (workspaceUsage.max === 'unlimited') return 0.1 // Show small progress for unlimited
    if (workspaceUsage.max === 0) return 1
    const actualRatio = workspaceUsage.usage / workspaceUsage.max

    if (actualRatio >= 1) return 1
    if (actualRatio <= 0) return 0

    if (actualRatio < 0.01) return 0.01 // Too small of a value makes the progress so small its not visible

    return actualRatio
  }, [workspaceUsage])

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

  const color = overlimits
    ? 'white'
    : ratio < 0.75
      ? 'primary'
      : 'warningMutedForeground'

  return <CircularProgress value={ratio} color={color} {...props} />
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

export type UsageSubscription = {
  name: string
  plan: SubscriptionPlan
}
export function UsageIndicatorPopover({
  children,
  workspaceUsage,
  subscription,
  calculatedUsage: {
    isOverlimits,
    isOverlimitsRuns,
    isOverlimitsMembers,
    ratio,
    max,
  },
  isLoading = false,
}: {
  children?: ReactNode
  subscription: UsageSubscription
  workspaceUsage?: WorkspaceUsage
  calculatedUsage: {
    ratio: number
    max: Quota
    isOverlimits: boolean
    isOverlimitsRuns: boolean
    isOverlimitsMembers: boolean
  }
  isLoading?: boolean
}) {
  const membersText = useMemo(
    () =>
      workspaceUsage
        ? membersDescription({
            members: workspaceUsage?.members || 0,
            maxMembers: workspaceUsage?.maxMembers || 0,
          })
        : undefined,
    [workspaceUsage],
  )
  const tracesText = useMemo(
    () => (workspaceUsage ? tracesDescription({ ratio, max }) : undefined),
    [workspaceUsage, ratio, max],
  )
  const isFree = FREE_PLANS.includes(subscription.plan)

  return (
    <Popover.Root>
      <Popover.Trigger asChild suppressHydrationWarning>
        <Button
          size='small'
          variant={isOverlimits && isFree ? 'destructive' : 'ghost'}
          className='hover:bg-muted'
        >
          <div className='flex flex-row items-center gap-x-1.5'>
            {isOverlimits && isFree ? (
              <Icon name='alert' color='white' />
            ) : (
              <UsageIndicatorCircle
                workspaceUsage={workspaceUsage}
                isLoading={isLoading}
                showBackground
              />
            )}
            <LoadingText isLoading={isLoading}>
              <Text.H6
                noWrap
                color={isOverlimits && isFree ? 'white' : 'foreground'}
              >
                {isOverlimits && isFree
                  ? 'Over limits'
                  : workspaceUsage?.max === 'unlimited'
                    ? `${workspaceUsage?.usage} / unlimited`
                    : `${workspaceUsage?.usage} / ${workspaceUsage?.max}`}
              </Text.H6>
            </LoadingText>
          </div>
        </Button>
      </Popover.Trigger>
      <Popover.Content side='bottom' align='end' size='medium'>
        <>
          <div className='flex flex-col gap-y-3'>
            <div className='flex flex-col gap-y-2'>
              <div className='flex flex-row items-center gap-x-2'>
                {isOverlimitsRuns && isFree ? (
                  <Icon
                    name='alert'
                    color='destructive'
                    size='large'
                    darkColor='foreground'
                  />
                ) : (
                  <UsageIndicatorCircle
                    workspaceUsage={workspaceUsage}
                    size={20}
                    isLoading={isLoading}
                    className='overflow-clip'
                    showBackground
                  />
                )}
                <LoadingText isLoading={isLoading}>
                  <div className='flex flex-row w-full items-center gap-2'>
                    <Text.H4 color='foreground'>
                      {workspaceUsage?.usage}
                    </Text.H4>
                    <Text.H4 color='foregroundMuted' noWrap>
                      {' '}
                      /{' '}
                      {workspaceUsage?.max === 'unlimited'
                        ? 'unlimited'
                        : workspaceUsage?.max}{' '}
                      traces
                    </Text.H4>
                    <div className='w-full flex items-center justify-end'>
                      <SubscriptionBadge subscription={subscription} />
                    </div>
                  </div>
                </LoadingText>
              </div>
              {tracesText ? (
                <Text.H6 display='block'>{tracesText}</Text.H6>
              ) : (
                <div className='w-full flex flex-col gap-1'>
                  <Skeleton className='w-full h-3 animate-pulse' />
                  <Skeleton className='w-full h-3 animate-pulse' />
                  <Skeleton className='w-[40%] h-3 animate-pulse' />
                </div>
              )}
            </div>
            <hr className='w-full border-border mt-2 mb-1' />
            <div className='flex flex-col gap-y-2'>
              <div className='flex flex-row items-center gap-x-2'>
                {isOverlimitsMembers && isFree ? (
                  <Icon
                    name='alert'
                    color='destructive'
                    size='large'
                    darkColor='foreground'
                  />
                ) : null}
                <LoadingText isLoading={isLoading}>
                  <div className='flex flex-row w-full items-center gap-2'>
                    <Text.H4 color='foreground'>
                      {workspaceUsage?.members}
                    </Text.H4>
                    <Text.H4 color='foregroundMuted' noWrap>
                      {' '}
                      /{' '}
                      {workspaceUsage?.maxMembers === 'unlimited'
                        ? 'unlimited'
                        : workspaceUsage?.maxMembers}{' '}
                      members
                    </Text.H4>
                  </div>
                </LoadingText>
              </div>
              {membersText ? (
                <Text.H6 display='block'>{membersText}</Text.H6>
              ) : (
                <div className='w-full flex flex-col gap-1'>
                  <Skeleton className='w-full h-3 animate-pulse' />
                  <Skeleton className='w-full h-3 animate-pulse' />
                  <Skeleton className='w-[40%] h-3 animate-pulse' />
                </div>
              )}
            </div>
          </div>
          {children ? <div className='flex flex-row'>{children}</div> : null}
        </>
      </Popover.Content>
    </Popover.Root>
  )
}
