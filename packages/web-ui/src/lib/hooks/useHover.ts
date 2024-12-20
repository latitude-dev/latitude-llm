'use client'
import { useEffect, useRef, useState } from 'react'

export function useHover() {
  const ref = useRef<HTMLElement>(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const onMouseEnter = () => setHovered(true)
    const onMouseLeave = () => setHovered(false)

    ref.current?.addEventListener('mouseenter', onMouseEnter)
    ref.current?.addEventListener('mouseleave', onMouseLeave)

    return () => {
      ref.current?.removeEventListener('mouseenter', onMouseEnter)
      ref.current?.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  return [ref, hovered] as const
}
