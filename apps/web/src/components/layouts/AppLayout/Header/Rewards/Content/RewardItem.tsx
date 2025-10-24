'use client'

import useRewards from '$/stores/rewards'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { useMemo } from 'react'
import { REWARD_VALUES, RewardType } from '@latitude-data/core/constants'
import { formatCount } from '$/lib/formatCount'

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

  const rewardCount = useMemo(() => {
    return formatCount(REWARD_VALUES[type])
  }, [type])

  return (
    <span className='w-full'>
      <Button
        variant='nope'
        className='justify-start !py-3 !rounded-none transition-opacity'
        containerClassName={cn({
          'hover:opacity-75': !isClaimed,
          '!cursor-default pointer-events-none': isClaimed,
        })}
        fullWidth
        onClick={onClick}
      >
        <div className='flex flex-row w-full items-center gap-4 justify-between'>
          <div className='flex flex-row items-center gap-2'>
            {isLoading ? (
              <Icon
                name='loader'
                color='foregroundMuted'
                className='animate-spin flex-shrink-0 stroke-[2.25]'
              />
            ) : (
              <Icon
                name={isClaimed ? 'check' : 'circle'}
                color={isClaimed ? 'accentForeground' : 'foregroundMuted'}
                className='flex-shrink-0 stroke-[2.25]'
              />
            )}
            <Text.H5M color={isClaimed ? 'primary' : 'foreground'}>
              {description}
            </Text.H5M>
          </div>
          <Badge
            variant={isClaimed ? 'noBorderMuted' : 'noBorderLatte'}
            color='accentForeground'
            size='large'
            className='flex-shrink-0'
          >
            +{rewardCount} runs
          </Badge>
        </div>
      </Button>
    </span>
  )
}
