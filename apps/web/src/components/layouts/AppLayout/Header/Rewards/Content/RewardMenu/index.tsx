'use client'

import { useMemo } from 'react'

import { RewardType } from '@latitude-data/core/browser'
import { Button, Icon } from '@latitude-data/web-ui'
import useRewards from '$/stores/rewards'

import { REWARD_CONFIGS } from './RewardConfigs'
import { RewardMenuBase } from './RewardMenuBase'

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
  }, [type, claimedRewardData])

  return (
    <div className='flex flex-col p-4 gap-6 items-start'>
      <Button variant='link' className='p-0' onClick={onClose}>
        <Icon name='arrowLeft' /> Go back to list
      </Button>
      <RewardMenuBase
        claimedRewardData={claimedRewardData}
        claimReward={claimReward}
        config={config}
      />
    </div>
  )
}
