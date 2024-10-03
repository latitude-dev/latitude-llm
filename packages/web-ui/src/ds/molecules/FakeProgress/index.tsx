'use client'

import { useEffect, useState } from 'react'

import { cn } from '../../../lib/utils'
import { Progress } from '../../atoms'

const DELAY_INCREMENT = 50
const MAX_PROGRESS = 99
const PROGRESS_INCREMENT_PERCENTAGE = 10

export function FakeProgress({
  completed,
  className,
  indicatorClassName,
}: {
  completed: boolean
  className?: string
  indicatorClassName?: string
}) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (completed) {
      setProgress(100)
      return
    }

    let incrementDelay = 500
    let timeout: ReturnType<typeof setTimeout>
    const incrementProgress = () => {
      setProgress((prevProgress) => {
        const increment =
          (MAX_PROGRESS - prevProgress) / PROGRESS_INCREMENT_PERCENTAGE
        return prevProgress + increment
      })

      incrementDelay += DELAY_INCREMENT
      timeout = setTimeout(incrementProgress, incrementDelay)
    }

    timeout = setTimeout(incrementProgress, incrementDelay)
    return () => clearTimeout(timeout)
  }, [completed])

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
