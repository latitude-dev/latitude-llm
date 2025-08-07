import { useMemo } from 'react'
import { INNER_STROKE_WIDTH } from './constants'
import { BotEmotion } from './types'

export function DynamicBotMouth({ emotion }: { emotion: BotEmotion }) {
  const mouthPath = useMemo(() => {
    if (emotion === 'happy') return 'M10 16.5c1 1 3 1 4 0'
    if (emotion === 'unhappy') return 'M10 17c1 -1 3 -1 4 0'
    if (emotion === 'thinking') return 'M12 16.8C12 16.8, 12 16.8, 12 16.8'
    return 'M12 16.8C8 16.8, 14 16.8, 14 16.8'
  }, [emotion])

  return (
    <path
      d={mouthPath}
      className='transition-all duration-300 ease-in-out'
      strokeWidth={INNER_STROKE_WIDTH}
    />
  )
}
