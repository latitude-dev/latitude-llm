import { useMountEffect } from "@repo/ui"
import { useCallback, useRef, useState } from "react"
import {
  DEFAULT_TREE_FRACTION,
  KEYBOARD_STEP,
  KEYBOARD_STEP_LARGE,
  MIN_TREE_WIDTH,
  MIN_WATERFALL_WIDTH,
} from "./helpers.ts"

export function useResizablePanel({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [treeWidth, setTreeWidth] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const moveRef = useRef<((e: PointerEvent) => void) | null>(null)
  const upRef = useRef<(() => void) | null>(null)

  const cleanup = useCallback(() => {
    if (moveRef.current) {
      document.removeEventListener("pointermove", moveRef.current)
      moveRef.current = null
    }
    if (upRef.current) {
      document.removeEventListener("pointerup", upRef.current)
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

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      if (!containerRef.current) return

      setIsDragging(true)
      startX.current = e.clientX
      startWidth.current = treeWidth ?? 0

      const containerWidth = containerRef.current.offsetWidth
      const maxTreeWidth = containerWidth - MIN_WATERFALL_WIDTH

      const onPointerMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX.current
        const next = startWidth.current + delta
        setTreeWidth(Math.max(MIN_TREE_WIDTH, Math.min(maxTreeWidth, next)))
      }

      const onPointerUp = () => {
        setIsDragging(false)
        cleanup()
      }

      moveRef.current = onPointerMove
      upRef.current = onPointerUp
      document.addEventListener("pointermove", onPointerMove)
      document.addEventListener("pointerup", onPointerUp)
    },
    [treeWidth, containerRef, cleanup],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
      e.preventDefault()

      const step = e.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP
      const delta = e.key === "ArrowRight" ? step : -step
      const containerWidth = containerRef.current?.offsetWidth ?? 0
      const maxTreeWidth = containerWidth - MIN_WATERFALL_WIDTH

      setTreeWidth((prev) => {
        const base = prev ?? Math.floor(containerWidth * DEFAULT_TREE_FRACTION)
        return Math.max(MIN_TREE_WIDTH, Math.min(maxTreeWidth, base + delta))
      })
    },
    [containerRef],
  )

  return { treeWidth, isDragging, onPointerDown, onKeyDown }
}
