'use client'

import { useMemo } from 'react'

import { REWARD_VALUES, RewardType } from '@latitude-data/core/browser'
import { Button, cn, Icon, Text } from '@latitude-data/web-ui'
import useRewards from '$/stores/rewards'

export function RewardItem({
  description,
  type,
  onClick,
}: {
  description: string
  type: RewardType
  onClick?: () => void
}) {
  const { data: claimedRewards, isLoading } = useRewards()

  const isClaimed = useMemo(() => {
    if (isLoading || !claimedRewards) return false
    return claimedRewards.some((r) => r.rewardType === type)
  }, [isLoading, claimedRewards, type])

  const runs = useMemo(() => `${REWARD_VALUES[type] / 1000}k`, [type])

  return (
    <Button
      variant='ghost'
      className={cn('justify-start', {
        ' hover:bg-muted': !isClaimed,
        'cursor-default': isClaimed,
      })}
      fullWidth
      aria-disabled={isClaimed}
      onClick={onClick}
    >
      <div className='flex flex-row w-full items-center gap-4 justify-between'>
        <div className='flex flex-row items-center gap-1'>
          {isLoading ? (
            <Icon
              name='loader'
              color='foregroundMuted'
              className='animate-spin'
            />
          ) : (
            <Icon
              name='check'
              color={isClaimed ? 'primary' : 'foregroundMuted'}
              className={cn({ 'opacity-50': !isClaimed })}
            />
          )}
          <Text.H5M color={isClaimed ? 'primary' : 'foreground'}>
            {description}
          </Text.H5M>
        </div>
        <Text.H5M color={isClaimed ? 'primary' : 'foregroundMuted'}>
          +{runs} runs
        </Text.H5M>
      </div>
    </Button>
  )
}
