'use client'
import { useCallback, useRef, useState } from 'react'
import { colors, TextColor } from '../../../../tokens'
import { cn } from '../../../../../lib/utils'
import { useCursorPosition } from './hooks/followCursor'
import { DynamicBotEyes } from './Eyes'
import { EyeBehaviourSettings } from './hooks/eyeBehaviour'
import { BotEmotion } from './types'
import {
  STROKE_LINECAP,
  STROKE_LINEJOIN,
  OUTER_STROKE_WIDTH,
} from './constants'
import { AntennaSettings, DynamicBotAntenna } from './Antenna'
import { DynamicBotMouth } from './Mouth'
import { useFollowedPosition } from './hooks/useFollowedPosition'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type DynamicBotSettings = EyeBehaviourSettings &
  AntennaSettings & {
    distanceToFollowCursor?: number
    latteMode?: boolean
  }

type DynamicBotIconProps = {
  className?: string
  color?: TextColor
  emotion?: BotEmotion
  settings?: DynamicBotSettings
}

export function DynamicBot({
  className,
  emotion = 'normal',
  color,
  settings = {},
}: DynamicBotIconProps) {
  const isThinking = emotion === 'thinking'
  const ref = useRef<HTMLDivElement>(null)
  const position = useFollowedPosition(ref, {
    activeOnHover: true,
    threshold: 1,
  })
  const cursorPosition = useCursorPosition({
    position,
    maxDistance: settings.distanceToFollowCursor,
  })

  return (
    <div
      className={cn(
        'w-8 h-8 relative flex items-center justify-center',
        className,
      )}
      ref={ref}
    >
      <svg
        className={cn({
          [colors.textColors[color!]]: color,
        })}
        stroke='currentColor'
        viewBox='0 0 24 24'
        width='100%'
        height='100%'
        fill='none'
        strokeWidth={OUTER_STROKE_WIDTH}
        strokeLinecap={STROKE_LINECAP}
        strokeLinejoin={STROKE_LINEJOIN}
      >
        {settings.latteMode ? (
          <>
            <path d='M6,8 h12 a2,2 0 0 1 2,2 v6 a6,6 0 0 1 -6,6 h-4 a6,6 0 0 1 -6,-6 v-6 a2,2 0 0 1 2,-2 z' />
            <path d='M3.5 12c-3.2 -0 -3.2 5 0 5' />
          </>
        ) : (
          <>
            <rect x='4' y='8' width='16' height='12' rx='2' />
            <path d='M2 14h2' />
            <path d='M20 14h2' />
            <path d='M12 8V4.5' />
          </>
        )}

        <DynamicBotAntenna isThinking={isThinking} {...settings} />

        <DynamicBotEyes
          position={position}
          lookAt={cursorPosition}
          isClosed={isThinking}
          {...settings}
        />
        <DynamicBotMouth emotion={emotion} />
      </svg>
    </div>
  )
}

export function useDynamicBotEmotion({
  emotion: initialEmotion = 'normal',
}: {
  emotion?: BotEmotion
} = {}) {
  const [mainEmotion, setMainEmotion] = useState<BotEmotion>(initialEmotion)
  const [timedEmotion, setTimedEmotion] = useState<BotEmotion | undefined>()

  const reactWithEmotion = useCallback(
    async (emotion: BotEmotion, duration: number = 2_000) => {
      setTimedEmotion(emotion)
      await wait(duration)
      setTimedEmotion(undefined)
    },
    [],
  )

  return {
    emotion: timedEmotion ?? mainEmotion,
    setEmotion: setMainEmotion,
    reactWithEmotion,
  }
}
