import { useEffect, useMemo, useState } from 'react'
import { INNER_STROKE_WIDTH } from './constants'

export type AntennaSettings = {
  antennaSpeed?: number
}

export function DynamicBotAntenna({
  isThinking,
  antennaSpeed = 500,
}: AntennaSettings & {
  isThinking: boolean
}) {
  const [antennaDirection, setAntennaDirection] = useState<'left' | 'right'>(
    'left',
  )

  const antennaPath = useMemo(() => {
    if (antennaDirection === 'right') return 'M12 4H16'
    return 'M12 4H8'
  }, [antennaDirection])

  useEffect(() => {
    if (!isThinking) {
      setAntennaDirection('left')
      return
    }

    const interval = setInterval(() => {
      setAntennaDirection((prev) => (prev === 'left' ? 'right' : 'left'))
    }, antennaSpeed / 2)

    return () => clearInterval(interval)
  }, [isThinking])

  return (
    <path
      d={antennaPath}
      className='transition-all ease-in-out'
      style={{ transitionDuration: `${antennaSpeed}ms` }}
      strokeWidth={INNER_STROKE_WIDTH}
    />
  )
}
