import { useMemo } from 'react'
import { formatDuration } from '$/app/_lib/formatUtils'

export type TickMark = {
  position: number
  time: number
  label: string
}

export function useTickMarks({
  duration,
  width,
}: {
  duration: number
  width: number
}): TickMark[] {
  return useMemo(() => {
    const ticks = Math.min(10, Math.max(5, Math.floor(width / 100)))
    const marks: TickMark[] = []

    for (let i = 1; i < ticks; i++) {
      const timeValue = (i / ticks) * duration
      const positionPercent = (timeValue / duration) * 100
      marks.push({
        position: positionPercent,
        time: timeValue,
        label: formatDuration(timeValue, true, 0),
      })
    }

    return marks
  }, [duration, width])
}
