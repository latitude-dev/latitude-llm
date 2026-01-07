'use client'

import { formatDuration } from '$/app/_lib/formatUtils'
import { Optimization } from '@latitude-data/core/schema/models/types/Optimization'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useEffect, useMemo, useState } from 'react'
import { getOptimizationPhase } from './shared'

export function StatusCell({
  optimization,
  onCancelClick,
}: {
  optimization: Optimization
  onCancelClick: () => void
}) {
  const [now, setNow] = useState(new Date())
  const [isHovered, setIsHovered] = useState(false)
  const phase = getOptimizationPhase(optimization)

  useEffect(() => {
    if (!phase.isActive) return
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [phase.isActive])

  const elapsed = useMemo(() => {
    const start = new Date(optimization.createdAt)
    const end = new Date(optimization.finishedAt ?? now)
    return Math.max(0, end.getTime() - start.getTime())
  }, [optimization.createdAt, optimization.finishedAt, now])

  if (phase.isActive) {
    return (
      <Tooltip
        asChild
        trigger={
          <Button
            variant='ghost'
            className='p-0'
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={(e) => {
              e.stopPropagation()
              onCancelClick()
            }}
          >
            <div className='flex flex-row gap-2 items-center'>
              {isHovered ? (
                <Icon
                  name='circleStop'
                  color='destructive'
                  className='shrink-0'
                />
              ) : (
                <Icon name='loader' color='primary' spin className='shrink-0' />
              )}
              <div className='flex flex-col items-start'>
                <Text.H5
                  noWrap
                  color={isHovered ? 'destructive' : 'foreground'}
                  animate
                  userSelect={false}
                >
                  {phase.label}
                </Text.H5>
                <Text.H6 noWrap color='foregroundMuted' userSelect={false}>
                  {formatDuration(elapsed, false)}
                </Text.H6>
              </div>
            </div>
          </Button>
        }
      >
        Cancel optimization
      </Tooltip>
    )
  }

  return (
    <div className='flex flex-row gap-2 items-center'>
      {phase.hasError ? (
        <Icon name='alertCircle' color='destructive' className='shrink-0' />
      ) : (
        <Icon name='check' color='success' className='shrink-0' />
      )}
      <div className='flex flex-col items-start'>
        <Text.H5
          noWrap
          color={phase.hasError ? 'destructive' : 'foreground'}
          userSelect={false}
        >
          {phase.label}
        </Text.H5>
        <Text.H6 noWrap color='foregroundMuted' userSelect={false}>
          {formatDuration(elapsed, false)}
        </Text.H6>
      </div>
    </div>
  )
}
