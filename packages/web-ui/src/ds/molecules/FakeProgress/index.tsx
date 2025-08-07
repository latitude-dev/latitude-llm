'use client'

import { useEffect, useState } from 'react'

import { cn } from '../../../lib/utils'
import { Progress } from '../../atoms/Progress'

export function FakeProgress({
  completed,
  className,
  indicatorClassName,
  delayIncrement = 50,
  maxProgress = 99,
  progressIncrementPercentage = 10,
  initialDelay = 500,
}: {
  completed: boolean
  className?: string
  indicatorClassName?: string
  delayIncrement?: number
  maxProgress?: number
  progressIncrementPercentage?: number
  initialDelay?: number
}) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (completed) {
      setProgress(100)
      return
    }

    let incrementDelay = initialDelay
    let timeout: ReturnType<typeof setTimeout>
    const incrementProgress = () => {
      setProgress((prevProgress) => {
        const increment = (maxProgress - prevProgress) / progressIncrementPercentage
        return prevProgress + increment
      })

      incrementDelay += delayIncrement
      timeout = setTimeout(incrementProgress, incrementDelay)
    }

    timeout = setTimeout(incrementProgress, incrementDelay)
    return () => clearTimeout(timeout)
  }, [completed, delayIncrement, maxProgress, progressIncrementPercentage, initialDelay])

  return (
    <Progress
      value={progress}
      className={cn('h-2 bg-primary/10', className)}
      indicatorClassName={cn(
        {
          'duration-75': completed,
          'duration-1000 bg-primary/50': !completed,
        },
        indicatorClassName,
      )}
    />
  )
}
