import { useEffect, useMemo, useState } from 'react'
import { Position } from '../types'

export function useCursorPosition({
  position: iconPosition,
  maxDistance = 250,
}: {
  position: Position
  maxDistance?: number
}) {
  const [cursorPosition, setCursorPosition] = useState<Position>({ x: 0, y: 0 })

  const updateCursorPosition = (e: MouseEvent) => {
    setCursorPosition({ x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    window.addEventListener('mousemove', updateCursorPosition)
    return () => window.removeEventListener('mousemove', updateCursorPosition)
  }, [])

  return useMemo(() => {
    const distanceToMouse = Math.sqrt(
      (cursorPosition.x - iconPosition.x) ** 2 +
        (cursorPosition.y - iconPosition.y) ** 2,
    )
    if (distanceToMouse <= maxDistance) return cursorPosition
    return undefined
  }, [cursorPosition, iconPosition, maxDistance])
}
