'use client'

import { ExperimentDto } from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useEffect, useState } from 'react'

const getDuration = (start: Date | null, end: Date | null) => {
  if (!start) return undefined
  if (!end) return new Date().getTime() - start.getTime()
  return end.getTime() - start.getTime()
}

const toTimer = (duration: number) => {
  const seconds = Math.floor((duration / 1000) % 60)
    .toString()
    .padStart(2, '0')
  const minutes = Math.floor((duration / (1000 * 60)) % 60)
    .toString()
    .padStart(2, '0')
  const hours = Math.floor((duration / (1000 * 60 * 60)) % 24)

  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`
}

export function DurationCell({ experiment }: { experiment: ExperimentDto }) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    if (!experiment.startedAt || experiment.finishedAt) return

    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [experiment.startedAt, experiment.finishedAt])

  const duration = getDuration(
    experiment.startedAt ? new Date(experiment.startedAt) : null,
    experiment.finishedAt ? new Date(experiment.finishedAt) : now,
  )

  return <Text.H5 noWrap>{duration ? toTimer(duration) : 'Pending'}</Text.H5>
}
