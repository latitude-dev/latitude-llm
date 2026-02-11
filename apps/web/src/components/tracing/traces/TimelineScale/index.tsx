import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TickMark } from './useTickMarks'

export function TimelineScale({ tickMarks }: { tickMarks: TickMark[] }) {
  return (
    <>
      {tickMarks.map((mark, index) => (
        <div
          key={index}
          className='absolute bottom-0 h-full flex flex-col items-center -translate-x-1/2'
          style={{ left: `${mark.position}%` }}
        >
          <div className='w-px h-2 bg-border' />
          <Text.H6 color='foregroundMuted' userSelect={false}>
            {mark.label}
          </Text.H6>
        </div>
      ))}
    </>
  )
}
