import { useMountEffect } from "@repo/ui"
import { useCallback, useRef, useState } from "react"

export const MIN_PANEL_HEIGHT = 140
const DEFAULT_PANEL_HEIGHT = 320
// Reserve this much above the detail panel so the filters bar and a few tree rows stay visible.
export const MIN_CONTENT_ABOVE = 160
// Drag the panel shorter than this and it closes instead of clamping to the minimum.
const CLOSE_DRAG_THRESHOLD = 96
const KEYBOARD_STEP = 24

// Vertical sibling of the span-tree `useResizablePanel`: drags the span detail panel taller/shorter.
export function useDetailResize(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(DEFAULT_PANEL_HEIGHT)
  const [isDragging, setIsDragging] = useState(false)
  const drag = useRef<{ startY: number; startHeight: number; max: number } | null>(null)
  const moveRef = useRef<((event: PointerEvent) => void) | null>(null)
  const upRef = useRef<(() => void) | null>(null)

  const cleanup = useCallback(() => {
    if (moveRef.current) {
      document.removeEventListener("pointermove", moveRef.current)
      moveRef.current = null
    }
    if (upRef.current) {
      document.removeEventListener("pointerup", upRef.current)
      document.removeEventListener("pointercancel", upRef.current)
      upRef.current = null
    }
    document.body.style.removeProperty("user-select")
    document.body.style.removeProperty("cursor")
  }, [])

  const maxHeight = useCallback(() => {
    const panel = panelRef.current?.parentElement
    if (!panel) return DEFAULT_PANEL_HEIGHT
    return Math.max(MIN_PANEL_HEIGHT, panel.offsetHeight - MIN_CONTENT_ABOVE)
  }, [])

  useMountEffect(() => {
    const panel = panelRef.current?.parentElement
    if (!panel) return
    const observer = new ResizeObserver(() => setHeight((prev) => Math.min(prev, maxHeight())))
    observer.observe(panel)
    return () => {
      observer.disconnect()
      cleanup()
    }
  })

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault()
      if (!panelRef.current?.parentElement) return
      drag.current = { startY: event.clientY, startHeight: height, max: maxHeight() }
      setIsDragging(true)
      document.body.style.userSelect = "none"
      document.body.style.cursor = "ns-resize"

      const onMove = (moveEvent: PointerEvent) => {
        const current = drag.current
        if (!current) return
        const raw = current.startHeight + (current.startY - moveEvent.clientY)
        if (raw < CLOSE_DRAG_THRESHOLD) {
          drag.current = null
          setIsDragging(false)
          cleanup()
          onClose()
          return
        }
        setHeight(Math.max(MIN_PANEL_HEIGHT, Math.min(current.max, raw)))
      }
      const onUp = () => {
        drag.current = null
        setIsDragging(false)
        cleanup()
      }
      moveRef.current = onMove
      upRef.current = onUp
      document.addEventListener("pointermove", onMove)
      document.addEventListener("pointerup", onUp)
      document.addEventListener("pointercancel", onUp)
    },
    [height, maxHeight, cleanup, onClose],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
      event.preventDefault()
      const delta = event.key === "ArrowUp" ? KEYBOARD_STEP : -KEYBOARD_STEP
      setHeight((prev) => Math.max(MIN_PANEL_HEIGHT, Math.min(maxHeight(), prev + delta)))
    },
    [maxHeight],
  )

  return { panelRef, height, isDragging, onPointerDown, onKeyDown }
}
