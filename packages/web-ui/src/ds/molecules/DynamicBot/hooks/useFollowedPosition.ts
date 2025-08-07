import { useRef, useEffect, useState, type RefObject } from 'react'

export function useFollowedPosition<T extends HTMLElement>(
  ref: RefObject<T>,
  { activeOnHover = false, threshold = 1 }: { activeOnHover?: boolean; threshold?: number } = {},
) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const positionRef = useRef(position)

  useEffect(() => {
    let frameId: number
    let isActive = !activeOnHover

    const update = () => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }
      const prev = positionRef.current
      const moved = Math.hypot(center.x - prev.x, center.y - prev.y)
      if (moved > threshold) {
        positionRef.current = center
        setPosition(center)
      }
    }

    const loop = () => {
      if (isActive) {
        update()
        frameId = requestAnimationFrame(loop)
      }
    }

    const start = () => {
      isActive = true
      loop()
    }
    const stop = () => {
      isActive = false
      cancelAnimationFrame(frameId)
    }

    const el = ref.current
    if (activeOnHover && el) {
      el.addEventListener('mouseenter', start)
      el.addEventListener('mouseleave', stop)
    } else {
      start()
    }

    return () => {
      stop()
      if (activeOnHover && el) {
        el.removeEventListener('mouseenter', start)
        el.removeEventListener('mouseleave', stop)
      }
    }
  }, [ref, activeOnHover, threshold])

  return position
}
