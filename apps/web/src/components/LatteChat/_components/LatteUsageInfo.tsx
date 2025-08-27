'use client'

import { UpgradeLink } from '$/components/UpgradeLink'
import { formatCount } from '$/lib/formatCount'
import {
  FREE_PLANS,
  LatteUsage,
  SubscriptionPlan,
} from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Popover } from '@latitude-data/web-ui/atoms/Popover'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { format } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'

const ANIMATION_DURATION = 4

function hasUsageChanged(previous: LatteUsage, current: LatteUsage) {
  return (
    previous.billable !== current.billable ||
    previous.unbillable !== current.unbillable
  )
}

export function LatteUsageInfo({
  usage,
  plan,
}: {
  usage: LatteUsage
  plan: SubscriptionPlan
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  const previousRef = useRef<LatteUsage>(usage)

  const incurring = useMemo(() => {
    if (usage.included === 'unlimited') return Infinity
    return Number(Math.ceil((usage.billable / usage.included) * 100))
  }, [usage])

  useEffect(() => {
    if (hasUsageChanged(previousRef.current, usage)) {
      previousRef.current = usage
      setIsAnimating(true)
      const timer = setTimeout(
        () => setIsAnimating(false),
        ANIMATION_DURATION * 1000 + 100,
      )
      return () => clearTimeout(timer)
    }
  }, [usage])

  return (
    <div className='w-full flex items-center justify-center gap-2'>
      <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger asChild>
          <span
            className='flex items-center justify-center gap-2 select-none cursor-pointer truncate hover:opacity-60 transition-opacity'
            onClick={() => setIsOpen(!isOpen)}
          >
            <Icon
              name='circleGauge'
              color='foregroundMuted'
              className='shrink-0 mt-0.5'
            />
            <div className='relative overflow-hidden'>
              {usage.included === 'unlimited' ? (
                <Text.H6 color='foregroundMuted' noWrap ellipsis>
                  You've unlimited credits
                </Text.H6>
              ) : (
                <Text.H6 color='foregroundMuted' noWrap ellipsis>
                  You've used {incurring}% of your overall credit limit
                </Text.H6>
              )}
              {isAnimating && (
                <div
                  className='absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/80 to-transparent animate-shine'
                  style={{ animationDuration: `${ANIMATION_DURATION}s` }}
                />
              )}
            </div>
          </span>
        </Popover.Trigger>
        <Popover.Content
          side='top'
          sideOffset={10}
          align='center'
          className='!max-w-96 !rounded-xl !shadow-md focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none'
          autoFocus={false}
        >
          <div className='w-full h-full flex flex-col items-start justify-center gap-3 p-1'>
            <div className='w-full flex flex-col items-start justify-center gap-1.5'>
              {usage.included === 'unlimited' ? (
                <Text.H6 color='foregroundMuted' noWrap ellipsis>
                  <b>{formatCount(usage.billable + usage.unbillable)}</b> used
                  credits (unlimited)
                </Text.H6>
              ) : (
                <Text.H6 color='foregroundMuted' noWrap ellipsis>
                  <b>{formatCount(usage.billable)}</b>
                  <span className='mx-0.5'>/</span>
                  {formatCount(usage.included)} included credits
                  {/* TODO(credits): Uncomment this when clients are informed about */}
                  {/* {!!usage.unbillable &&
                    ` (+${formatCount(usage.unbillable)} bonus)`} */}
                </Text.H6>
              )}
              <UsageBar incurring={incurring} unbillable={usage.unbillable} />
            </div>
            <Text.H6 color='foregroundMuted' noWrap ellipsis>
              Resets {format(usage.resetsAt, 'MMMM d, yyyy')}
              {/* TODO(credits): Uncomment this when clients are informed about */}
              {/* {incurring > 100 &&
                usage.included !== 'unlimited' &&
                !FREE_PLANS.includes(plan) && (
                  <Text.H6 color='foregroundMuted' noWrap ellipsis>
                    <br />
                    You will be billed{' '}
                    {formatCount(usage.billable - usage.included)} extra credits
                  </Text.H6>
                )} */}
            </Text.H6>
            {incurring >= 100 && usage.included !== 'unlimited' && (
              <UpgradeLink className='w-full'>
                <Button fullWidth fancy roundy>
                  {FREE_PLANS.includes(plan)
                    ? 'Upgrade to Team plan'
                    : 'Contact us to upgrade'}
                </Button>
              </UpgradeLink>
            )}
          </div>
        </Popover.Content>
      </Popover.Root>
    </div>
  )
}

function UsageBar({
  incurring: incurringMaybeOverflowing,
}: {
  incurring: number
  unbillable: number
}) {
  const incurring = useMemo(() => {
    return Math.max(0, Math.min(100, incurringMaybeOverflowing))
  }, [incurringMaybeOverflowing])

  // TODO(credits): Uncomment this when clients are informed about
  // const bonus = useMemo(() => {
  //   return Math.max(0, Math.min(100, unbillable * 3))
  // }, [unbillable])

  return (
    <div className='max-w-[300px] flex items-center justify-start gap-1 overflow-hidden rounded-full shrink-0'>
      <div className='w-[200px] max-w-[200px] flex items-center justify-start gap-1 overflow-hidden rounded-full'>
        {incurring > 0 && (
          <div
            className='h-1 bg-primary rounded-full'
            style={{ width: `${incurring}%` }}
          />
        )}
        {100 - incurring > 0 && (
          <div
            className='h-1 bg-muted-foreground/50 rounded-full'
            style={{ width: `${100 - incurring}%` }}
          />
        )}
      </div>
      {/* TODO(credits): Uncomment this when clients are informed about */}
      {/* {bonus > 0 && (
        <div
          className='h-1 bg-success-muted-foreground/60 rounded-full'
          style={{ width: `${bonus}px` }}
        />
      )} */}
    </div>
  )
}
