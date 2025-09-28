'use client'
import { useMemo } from 'react'

import useRewards from '$/stores/rewards'
import { Button } from '@latitude-data/web-ui/atoms/Button'

import { REWARD_CONFIGS } from './RewardConfigs'
import { RewardMenuBase } from './RewardMenuBase'
import { RewardType } from '@latitude-data/core/constants'

export function RewardMenu({
  type,
  onClose,
}: {
  type: RewardType
  onClose: () => void
}) {
  const { data: claimedRewards, claimReward } = useRewards()

  const claimedRewardData = useMemo(() => {
    if (!claimedRewards) return undefined
    return claimedRewards.find((r) => r.rewardType === type)
  }, [claimedRewards, type])

  const config = useMemo(() => {
    return REWARD_CONFIGS[type]
  }, [type])

  if (!config) return null

  return (
    <div className='flex flex-col px-2 py-1 gap-2 items-start'>
      <Button
        variant='ghost'
        className='p-0'
        onClick={onClose}
        iconProps={{
          name: 'chevronLeft',
          placement: 'left',
          className: 'flex-shrink-0 stroke-[2.25]',
        }}
      >
        Back to Rewards
      </Button>
      <RewardMenuBase
        claimedRewardData={claimedRewardData}
        claimReward={claimReward}
        config={config}
      />
    </div>
  )
}
