'use client'

import { formatDuration } from '$/app/_lib/formatUtils'
import { Optimization } from '@latitude-data/core/schema/models/types/Optimization'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useEffect, useState } from 'react'
import { getOptimizationPhase } from './shared'

function getElapsedTime(
  start: Date | null,
  end: Date | null | undefined,
): number | undefined {
  if (!start) return undefined
  const endTime = end ? new Date(end).getTime() : Date.now()
  return endTime - new Date(start).getTime()
}

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

  const elapsed = getElapsedTime(
    optimization.createdAt ? new Date(optimization.createdAt) : null,
    phase.isActive
      ? now
      : optimization.finishedAt
        ? new Date(optimization.finishedAt)
        : undefined,
  )

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
                {elapsed !== undefined && (
                  <Text.H6 noWrap color='foregroundMuted' userSelect={false}>
                    {formatDuration(elapsed, false)}
                  </Text.H6>
                )}
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
        {elapsed !== undefined && (
          <Text.H6 noWrap color='foregroundMuted' userSelect={false}>
            {formatDuration(elapsed, false)}
          </Text.H6>
        )}
      </div>
    </div>
  )
}
