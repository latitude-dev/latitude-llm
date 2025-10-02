'use client'

import useRewards from '$/stores/rewards'
import { CircularProgress } from '@latitude-data/web-ui/atoms/CircularProgress'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useMemo } from 'react'
import { RewardType } from '@latitude-data/core/constants'

const REWARD_TYPES = Object.keys(RewardType).length

export function RewardsProgress() {
  return (
    <div>
      <span className='rounded-full bg-accent px-1.5 py-1 inline-flex items-center justify-start gap-2'>
        <RewardsProgressContent />
      </span>
    </div>
  )
}

function RewardsProgressContent() {
  const { data: claimedRewards, isLoading } = useRewards()

  const count = useMemo(
    () =>
      Object.keys(
        claimedRewards.reduce(
          (acc, reward) => {
            acc[reward.rewardType] = 1
            return acc
          },
          {} as Record<RewardType, number>,
        ),
      ).length,
    [claimedRewards],
  )

  if (isLoading) {
    return (
      <CircularProgress
        value={1}
        color='foregroundMuted'
        className='opacity-25 animate-pulse overflow-clip'
        animateOnMount={false}
        showBackground
      />
    )
  }

  return (
    <>
      <CircularProgress
        value={count / REWARD_TYPES}
        color='primary'
        className='overflow-clip'
        animateOnMount={false}
        showBackground
      />
      <Text.H6B color='accentForeground'>
        {count}/{REWARD_TYPES} completed
      </Text.H6B>
    </>
  )
}
