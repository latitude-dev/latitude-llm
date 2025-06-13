'use client'
import { useEffect, useRef, useState } from 'react'

export function useHover() {
  const ref = useRef<HTMLElement>(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const element = ref.current
    const onMouseEnter = () => setHovered(true)
    const onMouseLeave = () => setHovered(false)

    element?.addEventListener('mouseenter', onMouseEnter)
    element?.addEventListener('mouseleave', onMouseLeave)

    return () => {
      element?.removeEventListener('mouseenter', onMouseEnter)
      element?.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  return [ref, hovered] as const
}
