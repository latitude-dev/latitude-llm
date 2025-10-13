import { McpToolDto } from '$/stores/integrationTools'
import { RefObject, useLayoutEffect, useRef } from 'react'

export function useAnimatedItems({
  error,
  isLoading,
  sortedTools,
  containerRef,
}: {
  containerRef: RefObject<HTMLElement | null>
  error: unknown
  isLoading: boolean
  sortedTools: McpToolDto[]
}) {
  const prevPositionsRef = useRef<Map<string, DOMRect>>(new Map())
  useLayoutEffect(() => {
    if (isLoading || error) return

    const container = containerRef.current
    if (!container) return

    const children = Array.from(
      container.querySelectorAll('[data-tool-id]'),
    ) as HTMLElement[]

    children.forEach((child) => {
      const id = child.dataset.toolId
      if (!id) return

      const prevRect = prevPositionsRef.current.get(id)
      const currentRect = child.getBoundingClientRect()

      if (prevRect) {
        const deltaY = prevRect.top - currentRect.top

        if (deltaY !== 0) {
          // Invert: Move element to its previous position
          child.style.transform = `translateY(${deltaY}px)`
          child.style.transition = 'none'

          // Play: Animate to natural position
          requestAnimationFrame(() => {
            child.style.transition = 'transform 0.3s ease-in-out'
            child.style.transform = ''
          })
        }
      }

      // Store current position for next time
      prevPositionsRef.current.set(id, currentRect)
    })
  }, [sortedTools, isLoading, error, containerRef])
}
