import { useMountEffect } from "@repo/ui"
import { useCallback, useRef, useState } from "react"
import { DEFAULT_TREE_FRACTION, MIN_TREE_WIDTH, MIN_WATERFALL_WIDTH } from "./helpers.ts"

export function useResizablePanel({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [treeWidth, setTreeWidth] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const moveRef = useRef<((e: MouseEvent) => void) | null>(null)
  const upRef = useRef<(() => void) | null>(null)

  const cleanup = useCallback(() => {
    if (moveRef.current) {
      document.removeEventListener("mousemove", moveRef.current)
      moveRef.current = null
    }
    if (upRef.current) {
      document.removeEventListener("mouseup", upRef.current)
      upRef.current = null
    }
  }, [])

  useMountEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(() => {
      const containerWidth = el.offsetWidth
      const maxTreeWidth = containerWidth - MIN_WATERFALL_WIDTH
      setTreeWidth((prev) => {
        if (prev === null) return Math.floor(containerWidth * DEFAULT_TREE_FRACTION)
        return Math.max(MIN_TREE_WIDTH, Math.min(maxTreeWidth, prev))
      })
    })

    observer.observe(el)
    return () => {
      observer.disconnect()
      cleanup()
    }
  })

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      if (!containerRef.current) return

      setIsDragging(true)
      startX.current = e.clientX
      startWidth.current = treeWidth ?? 0

      const containerWidth = containerRef.current.offsetWidth
      const maxTreeWidth = containerWidth - MIN_WATERFALL_WIDTH

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX.current
        const next = startWidth.current + delta
        setTreeWidth(Math.max(MIN_TREE_WIDTH, Math.min(maxTreeWidth, next)))
      }

      const onMouseUp = () => {
        setIsDragging(false)
        cleanup()
      }

      moveRef.current = onMouseMove
      upRef.current = onMouseUp
      document.addEventListener("mousemove", onMouseMove)
      document.addEventListener("mouseup", onMouseUp)
    },
    [treeWidth, containerRef, cleanup],
  )

  return { treeWidth, isDragging, onDragStart }
}
