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
  const prevOrderRef = useRef<string[]>([])
  const animationFrameRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (isLoading || error) return

    const container = containerRef.current
    if (!container) return

    // Cancel any pending animation frame from previous render
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Create current order array
    const currentOrder = sortedTools.map((t) => t.name)
    const prevOrder = prevOrderRef.current

    // Check if order actually changed
    const orderChanged =
      currentOrder.length !== prevOrder.length ||
      currentOrder.some((name, i) => name !== prevOrder[i])

    // Get all children
    const children = Array.from(
      container.querySelectorAll('[data-tool-id]'),
    ) as HTMLElement[]

    // If order didn't change, just update positions without animating
    if (!orderChanged && prevOrder.length > 0) {
      children.forEach((child) => {
        const id = child.dataset.toolId
        if (!id) return

        // Cancel any in-flight animation
        child.style.transition = 'none'
        child.style.transform = ''

        const currentRect = child.getBoundingClientRect()
        prevPositionsRef.current.set(id, currentRect)
      })

      return
    }

    // Order changed - animate!
    children.forEach((child) => {
      const id = child.dataset.toolId
      if (!id) return

      // Cancel any in-flight animation immediately
      child.style.transition = 'none'
      child.style.transform = ''

      const prevRect = prevPositionsRef.current.get(id)
      const currentRect = child.getBoundingClientRect()

      if (prevRect) {
        const deltaY = prevRect.top - currentRect.top

        if (deltaY !== 0) {
          // Invert: Move element to its previous position
          child.style.transform = `translateY(${deltaY}px)`

          // Play: Animate to natural position
          animationFrameRef.current = requestAnimationFrame(() => {
            child.style.transition = 'transform 0.3s ease-in-out'
            child.style.transform = ''
          })
        }
      }

      // Store current position for next time
      prevPositionsRef.current.set(id, currentRect)
    })

    // Store current order for next comparison
    prevOrderRef.current = currentOrder

    // Cleanup function to cancel animation frame on unmount
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [sortedTools, isLoading, error, containerRef])
}
