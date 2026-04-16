import type { RefObject } from "react"
import { useCallback, useState } from "react"
import type { GenAIMessage } from "rosetta-ai"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { findIndices } from "./source-offset-resolver.ts"

export interface DetectedSelection {
  /** Cloned Range — survives focus changes and selection clearing */
  range: Range
  /** The visible selected text (trimmed) */
  selectedText: string
  /** Which message the selection starts in */
  startMessageIndex: number
  startPartIndex: number
  /** Which message the selection ends in (same as start for single-part) */
  endMessageIndex: number
  endPartIndex: number
  /** Whether this is a single-part selection (eligible for annotation) */
  isSinglePart: boolean
  /** Popover anchor position — bottom of the selection bounding rect */
  position: { x: number; y: number }
}

export function useSelectionDetector(
  containerRef: RefObject<HTMLElement | null>,
  _messages: readonly (GenAIMessage | null)[],
): { detected: DetectedSelection | null; clearDetection: () => void } {
  const [detected, setDetected] = useState<DetectedSelection | null>(null)

  const clearDetection = useCallback(() => {
    setDetected(null)
  }, [])

  useMountEffect(() => {
    let rafId: number | null = null
    let timerId: ReturnType<typeof setTimeout> | null = null
    let isSelecting = false

    const cancelPending = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      if (timerId !== null) {
        clearTimeout(timerId)
        timerId = null
      }
    }

    const handleSelectStart = (e: Event) => {
      const target = e.target
      const el = target instanceof Element ? target : (target as Node).parentElement
      if (el && containerRef.current?.contains(el)) {
        cancelPending()
        isSelecting = true
        setDetected(null)
      }
    }

    const processSelection = () => {
      const ws = window.getSelection()
      if (!ws || ws.rangeCount === 0) return

      const range = ws.getRangeAt(0)
      const selectedText = range.toString().trim()
      if (!selectedText) return

      const startInside = containerRef.current?.contains(range.startContainer) ?? false
      const endInside = containerRef.current?.contains(range.endContainer) ?? false

      if (!startInside && !endInside) return

      const startInfo = startInside ? findIndices(range.startContainer) : null
      const endInfo = endInside ? findIndices(range.endContainer) : null

      const insideInfo = startInfo ?? endInfo
      if (!insideInfo) return

      if (insideInfo.contentType !== "text" && insideInfo.contentType !== "reasoning") {
        return
      }

      let isSinglePart: boolean
      let resolvedStartInfo: { messageIndex: number; partIndex: number }
      let resolvedEndInfo: { messageIndex: number; partIndex: number }

      if (startInfo && endInfo) {
        isSinglePart = startInfo.messageIndex === endInfo.messageIndex && startInfo.partIndex === endInfo.partIndex
        resolvedStartInfo = startInfo
        resolvedEndInfo = endInfo
      } else {
        isSinglePart = true
        resolvedStartInfo = insideInfo
        resolvedEndInfo = insideInfo
      }

      const clonedRange = range.cloneRange()
      const rect = range.getBoundingClientRect()

      setDetected({
        range: clonedRange,
        selectedText,
        startMessageIndex: resolvedStartInfo.messageIndex,
        startPartIndex: resolvedStartInfo.partIndex,
        endMessageIndex: resolvedEndInfo.messageIndex,
        endPartIndex: resolvedEndInfo.partIndex,
        isSinglePart,
        position: { x: rect.left, y: rect.bottom },
      })
    }

    const handleMouseUp = () => {
      cancelPending()
      if (!isSelecting) return

      rafId = requestAnimationFrame(() => {
        rafId = null
        timerId = setTimeout(() => {
          processSelection()
          isSelecting = false
          timerId = null
        }, 0)
      })
    }

    document.addEventListener("selectstart", handleSelectStart)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      cancelPending()
      document.removeEventListener("selectstart", handleSelectStart)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  })

  return { detected, clearDetection }
}
