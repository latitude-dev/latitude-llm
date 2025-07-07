import { formatDuration } from '$/app/_lib/formatUtils'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useMemo } from 'react'

export function TimelineScale({
  duration,
  width,
}: {
  duration: number
  width: number
  minWidth: number
}) {
  const tickMarks = useMemo(() => {
    const ticks = Math.min(10, Math.max(5, Math.floor(width / 100)))
    const marks: Array<{ position: number; time: number; label: string }> = []

    // Skip the initial and final ticks
    for (let i = 1; i < ticks; i++) {
      const timeValue = (i / ticks) * duration
      const positionPercent = (timeValue / duration) * 100
      marks.push({
        position: positionPercent,
        time: timeValue,
        label: formatDuration(timeValue),
      })
    }

    return marks
  }, [duration, width])

  return (
    <div className='w-full h-full px-2 relative'>
      {tickMarks.map((mark, index) => (
        <div
          key={index}
          className='absolute bottom-0 h-full flex flex-col items-center'
          style={{ left: `${mark.position}%` }}
        >
          <div className='w-px h-2 bg-border' />
          <Text.H6 color='foregroundMuted' userSelect={false}>
            {mark.label}
          </Text.H6>
        </div>
      ))}
    </div>
  )
}
