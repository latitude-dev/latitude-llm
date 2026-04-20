import { createContext, type ReactNode, type RefObject, useCallback, useMemo, useRef, useState } from "react"
import type { GenAIMessage } from "rosetta-ai"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { type DetectedSelection, useSelectionDetector } from "./selection-detector.ts"
import { getPartText, resolveSourceOffsets, type TextSelectionAnchor } from "./source-offset-resolver.ts"

// Re-export types so external consumers keep the same import path
export type { TextSelectionAnchor } from "./source-offset-resolver.ts"

export const SELECTION_HIGHLIGHT_CLASSES = "selection:bg-yellow-100 dark:selection:bg-yellow-400/20"

export interface HighlightRange {
  messageIndex: number
  partIndex: number
  startOffset: number
  endOffset: number
  type: "annotation" | "selection"
  passed?: boolean
  id?: string
}

interface TextSelectionContextValue {
  detected: DetectedSelection | null
  anchor: TextSelectionAnchor | null
  resolveAndAnnotate: (clickPosition?: { x: number; y: number }, passed?: boolean | null) => TextSelectionAnchor | null
  resolveAndCopy: () => void
  clearSelection: () => void
  getHighlightsForBlock: (messageIndex: number, partIndex: number) => HighlightRange[]
}

export const TextSelectionContext = createContext<TextSelectionContextValue | null>(null)

export function TextSelectionProvider({
  messages,
  containerRef,
  onSelect,
  onDismiss,
  clearSelectionRef,
  highlightRanges = [],
  children,
}: {
  readonly messages: readonly (GenAIMessage | null)[]
  readonly containerRef: RefObject<HTMLElement | null>
  readonly onSelect?:
    | ((anchor: TextSelectionAnchor, position: { x: number; y: number }, passed: boolean | null) => void)
    | undefined
  readonly onDismiss?: (() => void) | undefined
  readonly clearSelectionRef?: RefObject<(() => void) | null> | undefined
  readonly highlightRanges?: ReadonlyArray<HighlightRange> | undefined
  readonly children: ReactNode
}) {
  const [anchor, setAnchor] = useState<TextSelectionAnchor | null>(null)
  const { detected, clearDetection } = useSelectionDetector(containerRef, messages)

  const messagesRef = useMemo(() => ({ current: messages }), [messages])

  const resolveAndAnnotate = useCallback(
    (clickPosition?: { x: number; y: number }, passed: boolean | null = null): TextSelectionAnchor | null => {
      if (!detected?.isSinglePart) return null

      const result = resolveSourceOffsets(
        detected.range,
        messagesRef.current,
        detected.startMessageIndex,
        detected.startPartIndex,
      )
      if (result) {
        setAnchor(result)
        onSelect?.(result, clickPosition ?? detected.position, passed)
      }
      window.getSelection()?.removeAllRanges()
      clearDetection()
      return result
    },
    [detected, messagesRef, onSelect, clearDetection],
  )

  const resolveAndCopy = useCallback(() => {
    if (!detected) return

    if (detected.isSinglePart) {
      const result = resolveSourceOffsets(
        detected.range,
        messagesRef.current,
        detected.startMessageIndex,
        detected.startPartIndex,
      )
      if (result) {
        const fullText = getPartText(messagesRef.current, result.messageIndex, result.partIndex)
        const markdown = fullText?.slice(result.startOffset, result.endOffset) ?? detected.selectedText
        navigator.clipboard.writeText(markdown)
      } else {
        navigator.clipboard.writeText(detected.selectedText)
      }
    } else {
      // Multi-message: map start/end messages, full markdown for middle
      const msgs = messagesRef.current
      const startIdx = detected.startMessageIndex
      const endIdx = detected.endMessageIndex
      const parts: string[] = []

      for (let i = startIdx; i <= endIdx; i++) {
        if (i === startIdx) {
          const result = resolveSourceOffsets(detected.range, msgs, i, detected.startPartIndex)
          if (result) {
            const fullText = getPartText(msgs, i, detected.startPartIndex)
            parts.push(fullText?.slice(result.startOffset) ?? "")
          }
        } else if (i === endIdx) {
          const result = resolveSourceOffsets(detected.range, msgs, i, detected.endPartIndex)
          if (result) {
            const fullText = getPartText(msgs, i, detected.endPartIndex)
            parts.push(fullText?.slice(0, result.endOffset) ?? "")
          }
        } else {
          const fullText = getPartText(msgs, i, 0)
          if (fullText) parts.push(fullText)
        }
      }

      navigator.clipboard.writeText(parts.length > 0 ? parts.join("\n\n") : detected.selectedText)
    }

    window.getSelection()?.removeAllRanges()
    clearDetection()
  }, [detected, messagesRef, clearDetection])

  const clearSelection = useCallback(() => {
    setAnchor(null)
    clearDetection()
    onDismiss?.()
    const ws = window.getSelection()
    if (ws?.rangeCount && containerRef.current?.contains(ws.getRangeAt(0).commonAncestorContainer)) {
      ws.removeAllRanges()
    }
  }, [clearDetection, containerRef, onDismiss])

  const clearSelectionFnRef = useRef(clearSelection)
  clearSelectionFnRef.current = clearSelection

  if (clearSelectionRef) {
    clearSelectionRef.current = clearSelection
  }

  useMountEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelectionFnRef.current()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  })

  const rangeIndex = useMemo(() => {
    const map = new Map<string, HighlightRange[]>()

    for (const r of highlightRanges) {
      const key = `${r.messageIndex}:${r.partIndex}`
      let arr = map.get(key)
      if (!arr) {
        arr = []
        map.set(key, arr)
      }
      arr.push(r)
    }

    // After user clicks Annotate, anchor is set and browser selection cleared.
    // Inject anchor as a highlight so the rehype plugin renders it while the
    // annotation popover is open.
    if (anchor) {
      const key = `${anchor.messageIndex}:${anchor.partIndex}`
      let arr = map.get(key)
      if (!arr) {
        arr = []
        map.set(key, arr)
      }
      const isDuplicate = arr.some((r) => r.startOffset === anchor.startOffset && r.endOffset === anchor.endOffset)
      if (!isDuplicate) {
        arr.push({
          messageIndex: anchor.messageIndex,
          partIndex: anchor.partIndex,
          startOffset: anchor.startOffset,
          endOffset: anchor.endOffset,
          type: "selection",
        })
      }
    }

    return map
  }, [highlightRanges, anchor])

  const getHighlightsForBlock = useCallback(
    (messageIndex: number, partIndex: number) => rangeIndex.get(`${messageIndex}:${partIndex}`) ?? [],
    [rangeIndex],
  )

  const value = useMemo<TextSelectionContextValue>(
    () => ({
      detected,
      anchor,
      resolveAndAnnotate,
      resolveAndCopy,
      clearSelection,
      getHighlightsForBlock,
    }),
    [detected, anchor, resolveAndAnnotate, resolveAndCopy, clearSelection, getHighlightsForBlock],
  )

  return <TextSelectionContext.Provider value={value}>{children}</TextSelectionContext.Provider>
}
