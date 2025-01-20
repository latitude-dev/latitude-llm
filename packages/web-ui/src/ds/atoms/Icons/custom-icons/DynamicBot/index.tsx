'use client'
import { LucideProps } from 'lucide-react'
import {
  SVGProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { colors, TextColor } from '../../../../tokens'
import { cn } from '../../../../../lib/utils'
import { useFollowCursorPath } from './useFollowCursor'

type BotEmotion = 'normal' | 'happy' | 'unhappy' | 'thinking'
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type DynamicBotProps = {
  color?: TextColor
  emotion?: BotEmotion
  minTimeBetweenBlinks?: number
  maxTimeBetweenBlinks?: number
  blinkDuration?: number
  minTimeToChangeDirection?: number
  maxTimeToChangeDirection?: number
  timeChangingDirection?: number
  distanceToFollowCursor?: number
  antennaSpeed?: number
} & LucideProps &
  SVGProps<SVGSVGElement>

export function DynamicBot({
  emotion = 'normal',
  minTimeBetweenBlinks = 2_000,
  maxTimeBetweenBlinks = 5_000,
  blinkDuration = 100,
  minTimeToChangeDirection = 10_000,
  maxTimeToChangeDirection = 20_000,
  timeChangingDirection = 3_000,
  antennaSpeed = 500,
  distanceToFollowCursor = 250,

  absoluteStrokeWidth,
  color,
  size = '24',
  fill = 'none',
  strokeWidth = '2',
  strokeLinecap = 'round',
  strokeLinejoin = 'round',
  ...rest
}: DynamicBotProps) {
  const isThinking = emotion === 'thinking'
  const [isBlinking, setIsBlinking] = useState(false)
  const [eyeDirection, setEyeDirection] = useState<'center' | 'left' | 'right'>(
    'center',
  )
  const [antennaDirection, setAntennaDirection] = useState<'left' | 'right'>(
    'left',
  )

  const ref = useRef<SVGSVGElement | null>(null)

  const {
    leftEyePath: cursorLeftEyePath,
    rightEyePath: cursorRightEyePath,
    isFollowingCursor,
  } = useFollowCursorPath({
    ref,
    distanceToFollowCursor,
  })

  const didSetup = useRef(false)
  useEffect(() => {
    if (didSetup.current) return
    didSetup.current = true

    async function nextBlink() {
      setIsBlinking(true)
      await wait(blinkDuration)
      setIsBlinking(false)
      await wait(
        Math.random() * (maxTimeBetweenBlinks - minTimeBetweenBlinks) +
          minTimeBetweenBlinks,
      )
      nextBlink()
    }

    async function nextDirection() {
      setEyeDirection('left')
      await wait(timeChangingDirection / 2)
      setEyeDirection('right')
      await wait(timeChangingDirection / 2)
      setEyeDirection('center')
      await wait(
        Math.random() * (maxTimeToChangeDirection - minTimeToChangeDirection) +
          minTimeToChangeDirection,
      )
      nextDirection()
    }

    nextBlink()
    nextDirection()
  }, [])

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

  const leftEyePath = useMemo(() => {
    if (isBlinking || isThinking) return 'M8.5 12.5h1'
    if (isFollowingCursor) return cursorLeftEyePath
    if (eyeDirection === 'left') return 'M8 12v2'
    if (eyeDirection === 'right') return 'M10 12v2'
    return 'M9 12v2'
  }, [
    isBlinking,
    eyeDirection,
    isThinking,
    isFollowingCursor,
    cursorLeftEyePath,
  ])

  const rightEyePath = useMemo(() => {
    if (isBlinking || isThinking) return 'M14.5 12.5h1'
    if (isFollowingCursor) return cursorRightEyePath
    if (eyeDirection === 'left') return 'M14 12v2'
    if (eyeDirection === 'right') return 'M16 12v2'
    return 'M15 12v2'
  }, [
    isBlinking,
    eyeDirection,
    isThinking,
    isFollowingCursor,
    cursorRightEyePath,
  ])

  const mouthPath = useMemo(() => {
    if (emotion === 'happy') return 'M10 16.5c1 1 3 1 4 0'
    if (emotion === 'unhappy') return 'M10 17c1 -1 3 -1 4 0'
    if (emotion === 'thinking') return 'M12 16.8C12 16.8, 12 16.8, 12 16.8'
    return 'M12 16.8C8 16.8, 14 16.8, 14 16.8'
  }, [emotion])

  const antennaPath = useMemo(() => {
    if (antennaDirection === 'right') return 'M12 4H16'
    return 'M12 4H8'
  }, [antennaDirection])

  const innerStrokeWidth = absoluteStrokeWidth ? strokeWidth : 1.5

  return (
    <svg
      className={cn({
        [colors.textColors[color!]]: color,
      })}
      ref={ref}
      width={size}
      height={size}
      stroke={'currentColor'}
      fill={fill}
      strokeWidth={strokeWidth}
      strokeLinecap={strokeLinecap}
      strokeLinejoin={strokeLinejoin}
      {...rest}
    >
      <path d='M12 8V4.5' />
      <rect x='4' y='8' width='16' height='12' rx='2' />
      <path d='M2 14h2' />
      <path d='M20 14h2' />
      <path
        d={antennaPath}
        className='transition-all ease-in-out'
        style={{ transitionDuration: `${antennaSpeed}ms` }}
        strokeWidth={innerStrokeWidth}
      />

      <path
        d={leftEyePath}
        className={
          isFollowingCursor ? '' : 'transition-all duration-300 ease-in-out'
        }
        strokeWidth={innerStrokeWidth}
      />
      <path
        d={rightEyePath}
        className={
          isFollowingCursor ? '' : 'transition-all duration-300 ease-in-out'
        }
        strokeWidth={innerStrokeWidth}
      />
      <path
        d={mouthPath}
        className='transition-all duration-300 ease-in-out'
        strokeWidth={innerStrokeWidth}
      />
    </svg>
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
