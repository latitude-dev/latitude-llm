import { useEffect, useMemo, useState } from 'react'
import { INNER_STROKE_WIDTH } from './constants'

export type AntennaSettings = {
  antennaSpeed?: number
}

export function DynamicBotAntenna({
  isThinking,
  antennaSpeed = 500,
  latteMode,
}: AntennaSettings & {
  isThinking: boolean
  latteMode?: boolean
}) {
  if (latteMode) {
    return <Smoke isThinking={isThinking} antennaSpeed={antennaSpeed} />
  }

  return <Antenna isThinking={isThinking} antennaSpeed={antennaSpeed} />
}

function Smoke({
  isThinking,
  antennaSpeed = 500,
}: AntennaSettings & {
  isThinking: boolean
}) {
  return (
    <path
      d='M12 2 c-0.5 0.8 -0.5 2   0 2.8 s0.5 2   0 2.8'
      fill='none'
      stroke='currentColor'
      strokeWidth={INNER_STROKE_WIDTH}
      strokeDasharray='4 4'
      opacity={isThinking ? 0.8 : 0}
    >
      <animate
        attributeName='stroke-dashoffset'
        from='0'
        to='8'
        dur={`${antennaSpeed * 2}ms`}
        repeatCount='indefinite'
      />
    </path>
  )
}

function Antenna({
  isThinking,
  antennaSpeed = 500,
}: AntennaSettings & {
  isThinking: boolean
}) {
  const [antennaDirection, setAntennaDirection] = useState<'left' | 'right'>('left')

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
  }, [isThinking, antennaSpeed])

  return (
    <path
      d={antennaPath}
      className='transition-all ease-in-out'
      style={{ transitionDuration: `${antennaSpeed}ms` }}
      strokeWidth={INNER_STROKE_WIDTH}
    />
  )
}
