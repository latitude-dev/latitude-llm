'use client'

import { ReactNode, useMemo } from 'react'

import { SubscriptionPlan, WorkspaceUsage } from '@latitude-data/core/browser'
import {
  Badge,
  Button,
  CircularProgress,
  CircularProgressProps,
  Icon,
  Popover,
  SessionUser,
  Skeleton,
  Text,
  useSession,
} from '@latitude-data/web-ui'
import useWorkspaceUsage from '$/stores/workspaceUsage'
import Link from 'next/link'
import { useCurrentTheme } from '$/hooks/useCurrentTheme'

function UsageIndicatorCircle({
  data,
  isLoading,
  overlimits,
  ...props
}: Omit<CircularProgressProps, 'value' | 'color'> & {
  data: WorkspaceUsage | undefined
  isLoading: boolean
  overlimits?: boolean
}) {
  const ratio = useMemo(() => {
    if (!data) return 1
    if (data.max === 0) return 1
    const actualRatio = data.usage / data.max

    if (actualRatio >= 1) return 1
    if (actualRatio <= 0) return 0

    if (actualRatio < 0.01) return 0.01 // Too small of a value makes the progress so small its not visible

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

  const color = overlimits
    ? 'destructive'
    : ratio < 0.75
      ? 'primary'
      : ratio >= 1
        ? 'destructive'
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

function descriptionText({ ratio, max }: { ratio: number; max: number }) {
  if (ratio <= 0) {
    return "You've reached the maximum number of runs. Your app will continue working, the Latitude limit reached means you'll no longer be able to run tests, view new logs or evaluation results."
  }
  if (ratio < 0.25) {
    return "You're running low on runs in your current plan. Your app will continue working, the Latitude limit reached means you'll no longer be able to run tests, view new logs or evaluation results."
  }

  return `Your plan has included ${max} runs. You can upgrade your plan to get more runs.`
}

const FREE_PLANS = [SubscriptionPlan.HobbyV1, SubscriptionPlan.HobbyV2]

function SubscriptionButton({
  paymentUrl,
  currentUser,
  subscriptionPlan,
}: {
  paymentUrl: string
  currentUser: SessionUser
  subscriptionPlan: SubscriptionPlan
}) {
  const upgradeLink = `${paymentUrl}?prefilled_email=${currentUser.email}`
  const isFreePlan = FREE_PLANS.includes(subscriptionPlan)
  const href = isFreePlan ? upgradeLink : 'mailto:hello@latitude.so'
  const label = isFreePlan ? 'Upgrade to Team plan' : 'Contact us to upgrade'
  return (
    <Link href={href} target='_blank'>
      <Button fancy>{label}</Button>
    </Link>
  )
}

export function UsageIndicator({ paymentUrl }: { paymentUrl: string }) {
  const theme = useCurrentTheme()
  const { data, isLoading } = useWorkspaceUsage()
  const { currentUser, subscriptionPlan, workspace } = useSession()
  const { ratio, max, isOverlimits, isOverlimitsRuns, isOverlimitsMembers } =
    useMemo(() => {
      if (!data) return { ratio: 1, max: 0, isOverlimits: false }

      const { usage, max, members, maxMembers } = data
      const ratio = (max - usage) / max
      const isOverlimitsMembers = members > maxMembers
      const isOverlimitsRuns = usage > max
      const isOverlimits = isOverlimitsRuns || isOverlimitsMembers

      return { ratio, max, isOverlimits, isOverlimitsRuns, isOverlimitsMembers }
    }, [data])
  const membersData = useMemo(() => {
    if (!data) return 'Loading...'

    const { members, maxMembers } = data

    if (members >= maxMembers) {
      return `You have reached the maximum number of members for your current plan. (${maxMembers} members allowed)`
    }

    return `Your plan has included ${maxMembers} members. You can upgrade your plan to get more members.`
  }, [data])

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant='ghost' className='hover:bg-muted'>
          <div className='flex flex-row items-center gap-x-2'>
            {isOverlimits ? (
              <Icon name='alert' color='destructive' darkColor='foreground' />
            ) : (
              <UsageIndicatorCircle
                data={data}
                isLoading={isLoading}
                showBackground
              />
            )}
            <LoadingText isLoading={isLoading}>
              <Text.H6
                noWrap
                theme={theme}
                darkColor='foreground'
                color={isOverlimits ? 'destructive' : 'foreground'}
              >
                {isOverlimits ? 'Over limits' : `${data?.usage} / ${data?.max}`}
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
                {isOverlimitsRuns ? (
                  <Icon
                    name='alert'
                    color='destructive'
                    size='large'
                    darkColor='foreground'
                  />
                ) : (
                  <UsageIndicatorCircle
                    data={data}
                    size={20}
                    isLoading={isLoading}
                    className='overflow-clip'
                    showBackground
                  />
                )}
                <LoadingText isLoading={isLoading}>
                  <div className='flex flex-row w-full items-center gap-2'>
                    <Text.H4 color='foreground'>{data?.usage}</Text.H4>
                    <Text.H4 color='foregroundMuted' noWrap>
                      {' '}
                      / {data?.max} runs
                    </Text.H4>
                    <div className='w-full flex items-center justify-end'>
                      <Badge variant='muted'>
                        <Text.H6 color='foregroundMuted'>
                          {subscriptionPlan.name}
                        </Text.H6>
                      </Badge>
                    </div>
                  </div>
                </LoadingText>
              </div>
              {data ? (
                <Text.H6 display='block'>
                  {descriptionText({ ratio, max })}
                </Text.H6>
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
                {isOverlimitsMembers ? (
                  <Icon
                    name='alert'
                    color='destructive'
                    size='large'
                    darkColor='foreground'
                  />
                ) : null}
                <LoadingText isLoading={isLoading}>
                  <div className='flex flex-row w-full items-center gap-2'>
                    <Text.H4 color='foreground'>{data?.members}</Text.H4>
                    <Text.H4 color='foregroundMuted' noWrap>
                      {' '}
                      / {data?.maxMembers} members
                    </Text.H4>
                  </div>
                </LoadingText>
              </div>
              {data ? (
                <Text.H6 display='block'>{membersData}</Text.H6>
              ) : (
                <div className='w-full flex flex-col gap-1'>
                  <Skeleton className='w-full h-3 animate-pulse' />
                  <Skeleton className='w-full h-3 animate-pulse' />
                  <Skeleton className='w-[40%] h-3 animate-pulse' />
                </div>
              )}
            </div>
          </div>
          <div className='flex flex-row'>
            <SubscriptionButton
              subscriptionPlan={workspace.currentSubscription.plan}
              currentUser={currentUser}
              paymentUrl={paymentUrl}
            />
          </div>
        </>
      </Popover.Content>
    </Popover.Root>
  )
}
