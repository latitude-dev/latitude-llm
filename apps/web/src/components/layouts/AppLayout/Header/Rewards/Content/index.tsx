'use client'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { useState } from 'react'
import { RewardItem } from './RewardItem'
import { RewardMenu } from './RewardMenu'
import { REWARD_CONFIGS } from './RewardMenu/RewardConfigs'
import { RewardsProgress } from './RewardsProgress'
import { RewardType } from '@latitude-data/core/constants'

export function RewardsContent() {
  const [selectedType, setSelectedType] = useState<RewardType>()
  const [isExpanded, setIsExpanded] = useState(false)

  if (selectedType) {
    return (
      <RewardMenu
        type={selectedType}
        onClose={() => setSelectedType(undefined)}
      />
    )
  }

  return (
    <div className='flex flex-col gap-2 p-2 pb-0'>
      <RewardsProgress />
      <div className='flex flex-col gap-0.5'>
        <Text.H3M>Earn Additional Runs!</Text.H3M>
        <Text.H5 color='foregroundMuted'>
          Complete these simple tasks and get additional runs
        </Text.H5>
      </div>
      <div className='flex flex-col gap-0.5 pt-2 divide-y divide-dashed divide-border'>
        <RewardItem
          description={REWARD_CONFIGS[RewardType.AgentShare].title}
          type={RewardType.AgentShare}
          onClick={() => setSelectedType(RewardType.AgentShare)}
        />
        <span className='w-full'>
          <CollapsibleBox
            title='Engage with us on Social Media'
            icon='globe'
            iconColor='foregroundMuted'
            isExpanded={isExpanded}
            onToggle={setIsExpanded}
            scrollable={false}
            paddingBottom={false}
            paddingRight={false}
            paddingLeft={false}
            titlePadding={false}
            headerDivider={true}
            className='w-full !border-none !border-t'
            expandedContent={
              <div className='w-full flex flex-col gap-0.5 pt-2 divide-y divide-dashed divide-border'>
                <RewardItem
                  description={REWARD_CONFIGS[RewardType.XFollow].title}
                  type={RewardType.XFollow}
                  onClick={() => setSelectedType(RewardType.XFollow)}
                />
                <RewardItem
                  description={REWARD_CONFIGS[RewardType.LinkedInFollow].title}
                  type={RewardType.LinkedInFollow}
                  onClick={() => setSelectedType(RewardType.LinkedInFollow)}
                />
                <RewardItem
                  description={REWARD_CONFIGS[RewardType.XPost].title}
                  type={RewardType.XPost}
                  onClick={() => setSelectedType(RewardType.XPost)}
                />
                <RewardItem
                  description={REWARD_CONFIGS[RewardType.LinkedInPost].title}
                  type={RewardType.LinkedInPost}
                  onClick={() => setSelectedType(RewardType.LinkedInPost)}
                />
              </div>
            }
          />
        </span>
        <RewardItem
          description={REWARD_CONFIGS[RewardType.GithubStar].title}
          type={RewardType.GithubStar}
          onClick={() => setSelectedType(RewardType.GithubStar)}
        />
        <RewardItem
          description={REWARD_CONFIGS[RewardType.Referral].title}
          type={RewardType.Referral}
          onClick={() => setSelectedType(RewardType.Referral)}
        />
      </div>
    </div>
  )
}
