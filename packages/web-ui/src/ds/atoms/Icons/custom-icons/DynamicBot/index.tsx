'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { colors, TextColor } from '../../../../tokens'
import { cn } from '../../../../../lib/utils'
import { useCursorPosition } from './hooks/followCursor'
import { DynamicBotEyes } from './Eyes'
import { EyeBehaviourSettings } from './hooks/eyeBehaviour'
import { BotEmotion, Position } from './types'
import {
  STROKE_LINECAP,
  STROKE_LINEJOIN,
  OUTER_STROKE_WIDTH,
} from './constants'
import { AntennaSettings, DynamicBotAntenna } from './Antenna'
import { DynamicBotMouth } from './Mouth'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type DynamicBotIconProps = {
  className?: string
  color?: TextColor
  emotion?: BotEmotion
}

type DynamicBotSettings = EyeBehaviourSettings &
  AntennaSettings & {
    distanceToFollowCursor?: number
  }

export function DynamicBot(
  { className, emotion = 'normal', color }: DynamicBotIconProps,
  settings: DynamicBotSettings = {},
) {
  const isThinking = emotion === 'thinking'
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 })
  const ref = useRef<SVGSVGElement | null>(null)

  const cursorPosition = useCursorPosition({
    position,
    maxDistance: settings.distanceToFollowCursor,
  })

  useEffect(() => {
    if (!ref.current) return

    const updatePosition = () => {
      const rect = ref.current!.getBoundingClientRect()
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      })
    }

    const observer = new ResizeObserver(updatePosition)
    observer.observe(ref.current)
    window.addEventListener('scroll', updatePosition)
    window.addEventListener('resize', updatePosition)

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', updatePosition)
      window.removeEventListener('resize', updatePosition)
    }
  }, [ref.current])

  return (
    <div
      className={cn(
        'w-8 h-8 relative flex items-center justify-center',
        className,
      )}
    >
      <svg
        className={cn({
          [colors.textColors[color!]]: color,
        })}
        ref={ref}
        stroke='currentColor'
        viewBox='0 0 24 24'
        width='100%'
        height='100%'
        fill='none'
        strokeWidth={OUTER_STROKE_WIDTH}
        strokeLinecap={STROKE_LINECAP}
        strokeLinejoin={STROKE_LINEJOIN}
      >
        <path d='M12 8V4.5' />
        <rect x='4' y='8' width='16' height='12' rx='2' />
        <path d='M2 14h2' />
        <path d='M20 14h2' />
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
