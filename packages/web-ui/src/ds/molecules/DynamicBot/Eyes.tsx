import { useMemo } from 'react'
import { INNER_STROKE_WIDTH } from './constants'
import { EyeBehaviourSettings, useEyeBehaviour } from './hooks/eyeBehaviour'
import { Position } from './types'
import { calculateUnitVector } from './utils'

const LEFT_EYE_X = 9
const RIGHT_EYE_X = 15
const EYE_Y = 12.5
const EYE_HEIGHT = 2

function buildEyePath({
  x,
  topY,
  bottomY,
}: {
  x: number
  topY: number
  bottomY: number
}) {
  return `M${x} ${topY}v${bottomY - topY}`
}

function calculateLookAtPath({
  lookAt,
  position,
}: {
  lookAt: Position
  position: Position
}) {
  const targetVector = {
    x: lookAt.x - position.x,
    y: lookAt.y - position.y,
  }
  const magnitude = Math.sqrt(
    (lookAt.x - position.x) ** 2 + (lookAt.y - position.y) ** 2,
  )

  const unitVector = calculateUnitVector({
    ...targetVector,
    magnitude,
  })

  const topY =
    EYE_Y -
    (unitVector.y <= 0
      ? EYE_HEIGHT / 2
      : EYE_HEIGHT / 2 - unitVector.y * (EYE_HEIGHT / 2))

  const bottomY =
    EYE_Y +
    (unitVector.y >= 0
      ? EYE_HEIGHT / 2
      : EYE_HEIGHT / 2 + unitVector.y * (EYE_HEIGHT / 2))

  return [
    buildEyePath({ x: LEFT_EYE_X + unitVector.x, topY, bottomY }),
    buildEyePath({ x: RIGHT_EYE_X + unitVector.x, topY, bottomY }),
  ]
}

export function DynamicBotEyes({
  isClosed,
  position,
  lookAt,
  ...eyeBehaviourSettings
}: {
  isClosed: boolean
  position: Position
  lookAt?: Position
} & EyeBehaviourSettings) {
  const { isBlinking, eyeDirection } = useEyeBehaviour(eyeBehaviourSettings)

  const [lookAtLeftPath, lookAtRightPath] = useMemo(() => {
    if (!lookAt) return [undefined, undefined]
    return calculateLookAtPath({ position, lookAt })
  }, [position, lookAt])

  const leftEyePath = useMemo(() => {
    if (isClosed || isBlinking) return 'M8.5 12.5h1'
    if (lookAtLeftPath) return lookAtLeftPath
    if (eyeDirection === 'left') return 'M8 12v2'
    if (eyeDirection === 'right') return 'M10 12v2'
    return 'M9 12v2'
  }, [isBlinking, isClosed, eyeDirection, lookAtLeftPath])

  const rightEyePath = useMemo(() => {
    if (isClosed || isBlinking) return 'M14.5 12.5h1'
    if (lookAtRightPath) return lookAtRightPath
    if (eyeDirection === 'left') return 'M14 12v2'
    if (eyeDirection === 'right') return 'M16 12v2'
    return 'M15 12v2'
  }, [isBlinking, isClosed, eyeDirection, lookAtRightPath])

  return (
    <>
      <path
        d={leftEyePath}
        className={lookAt ? '' : 'transition-all duration-300 ease-in-out'}
        strokeWidth={INNER_STROKE_WIDTH}
      />
      <path
        d={rightEyePath}
        className={lookAt ? '' : 'transition-all duration-300 ease-in-out'}
        strokeWidth={INNER_STROKE_WIDTH}
      />
    </>
  )
}
