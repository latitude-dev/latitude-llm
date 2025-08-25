import { useEffect, useRef, useState } from 'react'
import { wait } from '../utils'
import type { EyeDirection } from '../types'

export type EyeBehaviourSettings = {
  minTimeBetweenBlinks?: number
  maxTimeBetweenBlinks?: number
  blinkDuration?: number
  minTimeToChangeDirection?: number
  maxTimeToChangeDirection?: number
  timeChangingDirection?: number
}

export function useEyeBehaviour({
  minTimeBetweenBlinks = 2_000,
  maxTimeBetweenBlinks = 5_000,
  blinkDuration = 100,
  minTimeToChangeDirection = 10_000,
  maxTimeToChangeDirection = 20_000,
  timeChangingDirection = 3_000,
}: EyeBehaviourSettings) {
  const [isBlinking, setIsBlinking] = useState(false)
  const [eyeDirection, setEyeDirection] = useState<EyeDirection>('center')
  const didSetup = useRef(false)

  useEffect(() => {
    if (didSetup.current) return
    didSetup.current = true

    async function nextBlink() {
      setIsBlinking(true)
      await wait(blinkDuration)
      setIsBlinking(false)
      await wait(
        Math.random() * (maxTimeBetweenBlinks - minTimeBetweenBlinks) + minTimeBetweenBlinks,
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
  }, [
    blinkDuration,
    maxTimeBetweenBlinks,
    minTimeBetweenBlinks,
    timeChangingDirection,
    maxTimeToChangeDirection,
    minTimeToChangeDirection,
  ])

  return { isBlinking, eyeDirection }
}
