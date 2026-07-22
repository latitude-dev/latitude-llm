import { useMountEffect } from "@repo/ui"
import { useCallback, useRef, useState } from "react"

const DEFAULT_KEYBOARD_STEP = 24

interface Options {
  readonly minHeight: number
  readonly minContentAbove: number
  readonly closeThreshold: number
  readonly defaultHeight: number | "half"
  readonly onClose: () => void
  readonly keyboardStep?: number
}

/**
 * Drag/keyboard resize for a panel pinned to the bottom of a flex container.
 *
 * Attach `panelRef` to the panel root (its `parentElement` is the sizing
 * container) and apply `height` where the panel's resizable area lives.
 * `minContentAbove` reserves space so the content above never collapses;
 * dragging shorter than `closeThreshold` calls `onClose` instead of clamping.
 */
export function useResizablePanelHeight({
  minHeight,
  minContentAbove,
  closeThreshold,
  defaultHeight,
  onClose,
  keyboardStep = DEFAULT_KEYBOARD_STEP,
}: Options) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(typeof defaultHeight === "number" ? defaultHeight : minHeight)
  const [isDragging, setIsDragging] = useState(false)
  const drag = useRef<{ startY: number; startHeight: number } | null>(null)
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
    if (!panel) return Number.POSITIVE_INFINITY
    return Math.max(minHeight, panel.offsetHeight - minContentAbove)
  }, [minHeight, minContentAbove])

  useMountEffect(() => {
    const panel = panelRef.current?.parentElement
    if (!panel) return
    if (defaultHeight === "half") {
      setHeight(Math.max(minHeight, Math.min(maxHeight(), Math.round(panel.offsetHeight / 2))))
    }
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
      drag.current = { startY: event.clientY, startHeight: height }
      setIsDragging(true)
      document.body.style.userSelect = "none"
      document.body.style.cursor = "ns-resize"

      const onMove = (moveEvent: PointerEvent) => {
        const current = drag.current
        if (!current) return
        const raw = current.startHeight + (current.startY - moveEvent.clientY)
        if (raw < closeThreshold) {
          drag.current = null
          setIsDragging(false)
          cleanup()
          onClose()
          return
        }
        setHeight(Math.max(minHeight, Math.min(maxHeight(), raw)))
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
    [height, minHeight, maxHeight, closeThreshold, cleanup, onClose],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
      event.preventDefault()
      const delta = event.key === "ArrowUp" ? keyboardStep : -keyboardStep
      setHeight((prev) => Math.max(minHeight, Math.min(maxHeight(), prev + delta)))
    },
    [minHeight, maxHeight, keyboardStep],
  )

  return { panelRef, height, isDragging, onPointerDown, onKeyDown }
}
