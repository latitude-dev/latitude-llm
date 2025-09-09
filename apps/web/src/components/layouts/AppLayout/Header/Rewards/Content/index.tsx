'use client'

import { RewardType } from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useState } from 'react'
import { RewardItem } from './RewardItem'
import { RewardMenu } from './RewardMenu'
import { REWARD_CONFIGS } from './RewardMenu/RewardConfigs'
import { RewardsProgress } from './RewardsProgress'

export function RewardsContent() {
  const [selectedType, setSelectedType] = useState<RewardType>()

  if (selectedType) {
    return (
      <RewardMenu
        type={selectedType}
        onClose={() => setSelectedType(undefined)}
      />
    )
  }

  return (
    <div className='flex flex-col gap-2 p-2'>
      <RewardsProgress />
      <div className='flex flex-col gap-0.5'>
        <Text.H3M>Earn Latte credits!</Text.H3M>
        <Text.H5 color='foregroundMuted'>
          Complete these simple tasks and get additional Latte credits
        </Text.H5>
      </div>
      <div className='flex flex-col gap-0.5 pt-2 divide-y divide-dashed divide-border'>
        {Object.values(REWARD_CONFIGS).map((config, index) => (
          <RewardItem
            key={index}
            description={config.title}
            type={config.type}
            onClick={() => setSelectedType(config.type)}
          />
        ))}
      </div>
    </div>
  )
}
