import { RefObject, useEffect, useState } from 'react'

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

function calculateUnitVector({
  x,
  y,
  magnitude,
}: {
  x: number
  y: number
  magnitude: number
}): {
  x: number
  y: number
} {
  if (magnitude === 0) return { x: 0, y: 0 }
  return { x: x / magnitude, y: y / magnitude }
}

export function useFollowCursorPath({
  ref,
  distanceToFollowCursor,
}: {
  ref: RefObject<SVGSVGElement>
  distanceToFollowCursor: number
}) {
  const LEFT_EYE_X = 9
  const RIGHT_EYE_X = 15
  const EYE_Y = 12.5
  const EYE_HEIGHT = 2

  const [isFollowingCursor, setIsFollowingCursor] = useState(false)
  const [leftEyePath, setLeftEyePath] = useState(
    buildEyePath({
      x: LEFT_EYE_X,
      topY: EYE_Y - EYE_HEIGHT / 2,
      bottomY: EYE_Y + EYE_HEIGHT / 2,
    }),
  )
  const [rightEyePath, setRightEyePath] = useState(
    buildEyePath({
      x: RIGHT_EYE_X,
      topY: EYE_Y - EYE_HEIGHT / 2,
      bottomY: EYE_Y + EYE_HEIGHT / 2,
    }),
  )

  const followCursor = (e: MouseEvent) => {
    if (!ref.current) return

    const svg = ref.current
    const svgRect = svg.getBoundingClientRect()

    const mousePos = { x: e.clientX, y: e.clientY }
    const iconPos = {
      x: svgRect.left + svgRect.width / 2,
      y: svgRect.top + svgRect.height / 2,
    }

    const targetVector = {
      x: mousePos.x - iconPos.x,
      y: mousePos.y - iconPos.y,
    }

    const distanceToMouse = Math.sqrt(
      (mousePos.x - iconPos.x) ** 2 + (mousePos.y - iconPos.y) ** 2,
    )

    setIsFollowingCursor(distanceToMouse < distanceToFollowCursor)

    const unitVector = calculateUnitVector({
      ...targetVector,
      magnitude: distanceToMouse,
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

    setLeftEyePath(
      buildEyePath({ x: LEFT_EYE_X + unitVector.x, topY, bottomY }),
    )
    setRightEyePath(
      buildEyePath({ x: RIGHT_EYE_X + unitVector.x, topY, bottomY }),
    )
  }

  useEffect(() => {
    window.addEventListener('mousemove', followCursor)
    return () => window.removeEventListener('mousemove', followCursor)
  }, [])

  return { leftEyePath, rightEyePath, isFollowingCursor }
}
