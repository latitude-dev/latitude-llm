import { createContext, type ReactNode, type RefObject, useCallback, useMemo, useRef, useState } from "react"
import type { GenAIMessage } from "rosetta-ai"
import { useMountEffect } from "../../hooks/use-mount-effect.ts"

// --- Public types ---

export interface TextSelectionAnchor {
  messageIndex: number
  partIndex: number
  startOffset: number
  endOffset: number
  selectedText: string
}

export interface HighlightRange {
  messageIndex: number
  partIndex: number
  startOffset: number
  endOffset: number
  type: "annotation" | "selection"
  passed?: boolean
  id?: string
  onClick?: (position: { x: number; y: number }) => void
}

// --- Context ---

interface TextSelectionContextValue {
  selection: TextSelectionAnchor | null
  getHighlightsForBlock: (messageIndex: number, partIndex: number) => HighlightRange[]
}

const TextSelectionContext = createContext<TextSelectionContextValue | null>(null)

export { TextSelectionContext }

// --- DOM helpers ---

function getPartText(
  messages: readonly (GenAIMessage | null)[],
  messageIndex: number,
  partIndex: number,
): string | null {
  const msg = messages[messageIndex]
  if (!msg) return null

  let parts = msg.parts
  if (!parts || parts.length === 0) {
    const content = (msg as { content?: string }).content
    if (typeof content === "string") {
      parts = [{ type: "text" as const, content }]
    } else {
      return null
    }
  }

  const part = parts[partIndex]
  if (!part) return null

  if (part.type === "text" || part.type === "reasoning") {
    return (part as { content: string }).content ?? null
  }
  return null
}

function findIndices(node: Node) {
  let el: HTMLElement | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)

  let messageIndex: number | null = null
  let partIndex: number | null = null
  let contentType: string | null = null

  while (el) {
    if (messageIndex === null) {
      const v = el.getAttribute("data-message-index")
      if (v !== null) messageIndex = parseInt(v, 10)
    }
    if (partIndex === null) {
      const v = el.getAttribute("data-part-index")
      if (v !== null) partIndex = parseInt(v, 10)
    }
    if (contentType === null) {
      const v = el.getAttribute("data-content-type")
      if (v) contentType = v
    }
    if (messageIndex !== null && partIndex !== null) break
    el = el.parentElement
  }

  if (messageIndex !== null && partIndex !== null) {
    return { messageIndex, partIndex, contentType: contentType ?? "text" }
  }
  return null
}

function findPartRoot(node: Node): HTMLElement | null {
  let el: HTMLElement | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
  while (el) {
    if (el.getAttribute("data-part-index") !== null) return el
    el = el.parentElement
  }
  return null
}

function collectTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  let n = walker.nextNode()
  while (n) {
    if (n.textContent) nodes.push(n as Text)
    n = walker.nextNode()
  }
  return nodes
}

function getSourceOffsetsFromNode(node: Node): { start: number; end: number } | null {
  let el: HTMLElement | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
  while (el) {
    const start = el.getAttribute("data-source-start")
    const end = el.getAttribute("data-source-end")
    if (start !== null && end !== null) {
      const startNum = parseInt(start, 10)
      const endNum = parseInt(end, 10)
      if (!Number.isNaN(startNum) && !Number.isNaN(endNum) && endNum >= startNum) {
        return { start: startNum, end: endNum }
      }
    }
    el = el.parentElement
  }
  return null
}

/**
 * Computes canonical plain-text offsets from a DOM Range.
 *
 * Walks through all text nodes in the part root element and accumulates lengths
 * to find where the Range's start/end containers fall. Because the conversation
 * renders text with `white-space: pre-wrap`, the DOM text content matches the
 * canonical string 1:1 (newlines are preserved), so DOM offsets equal canonical offsets.
 */
function calculateTextOffsets(
  textNodes: Text[],
  startContainer: Node,
  endContainer: Node,
  range: Range,
): { textStart: number; textEnd: number } | null {
  // Markdown render path: each text segment is wrapped with source offsets so
  // we can map user selection back to canonical source coordinates.
  const startSource = getSourceOffsetsFromNode(startContainer)
  const endSource = getSourceOffsetsFromNode(endContainer)
  if (startSource && endSource) {
    const textStart = Math.min(startSource.end, startSource.start + range.startOffset)
    const textEnd = Math.min(endSource.end, endSource.start + range.endOffset)
    if (textEnd <= textStart) return null
    return { textStart, textEnd }
  }

  let start = -1
  let end = -1
  let offset = 0

  for (const textNode of textNodes) {
    const len = textNode.textContent?.length ?? 0
    if (textNode === startContainer) start = offset + range.startOffset
    if (textNode === endContainer) end = offset + range.endOffset
    offset += len
    if (start >= 0 && end >= 0) break
  }

  if (start < 0 || end < 0 || end <= start) return null
  return { textStart: start, textEnd: end }
}

// --- Selection hook ---

function useTextSelectionHook(
  messages: readonly (GenAIMessage | null)[],
  containerRef: RefObject<HTMLElement | null>,
  onSelect?: (anchor: TextSelectionAnchor, position: { x: number; y: number }) => void,
) {
  const [selection, setSelection] = useState<TextSelectionAnchor | null>(null)

  const clearSelection = useCallback(() => {
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  // Store callbacks in refs so the mount-only effect always calls the latest version
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const selectionRef = useRef(selection)
  selectionRef.current = selection

  const processSelection = useCallback(() => {
    const windowSelection = window.getSelection()
    if (!windowSelection || windowSelection.rangeCount === 0) return

    const range = windowSelection.getRangeAt(0)
    const selectedText = range.toString().trim()
    if (!selectedText) {
      if (selectionRef.current) clearSelection()
      return
    }

    if (
      !containerRef.current?.contains(range.commonAncestorContainer) &&
      !containerRef.current?.contains(range.startContainer)
    ) {
      clearSelection()
      return
    }

    const startInfo = findIndices(range.startContainer)
    const endInfo = findIndices(range.endContainer)

    if (!startInfo || !endInfo) {
      clearSelection()
      return
    }

    // Require single-part selection within selectable textual blocks.
    if (
      startInfo.messageIndex !== endInfo.messageIndex ||
      startInfo.partIndex !== endInfo.partIndex ||
      (startInfo.contentType !== "text" && startInfo.contentType !== "reasoning")
    ) {
      clearSelection()
      return
    }

    const fullText = getPartText(messagesRef.current, startInfo.messageIndex, startInfo.partIndex)
    if (!fullText) {
      clearSelection()
      return
    }

    const partRoot = findPartRoot(range.startContainer)
    if (!partRoot) {
      clearSelection()
      return
    }

    const textNodes = collectTextNodes(partRoot)
    const offsets = calculateTextOffsets(textNodes, range.startContainer, range.endContainer, range)
    if (!offsets) return

    const anchor: TextSelectionAnchor = {
      messageIndex: startInfo.messageIndex,
      partIndex: startInfo.partIndex,
      startOffset: offsets.textStart,
      endOffset: offsets.textEnd,
      selectedText,
    }

    setSelection(anchor)

    const rect = range.getBoundingClientRect()
    onSelectRef.current?.(anchor, { x: rect.left, y: rect.bottom })

    // Clear browser selection so custom highlight styles are consistent
    window.getSelection()?.removeAllRanges()
  }, [clearSelection, containerRef])

  // Register DOM event listeners once on mount; callbacks read latest state via refs.
  useMountEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>
    let isSelecting = false

    const handleSelectStart = (e: Event) => {
      const target = e.target
      const el = target instanceof Element ? target : (target as Node).parentElement
      if (el && containerRef.current?.contains(el)) isSelecting = true
    }

    const handleMouseUp = () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (!isSelecting) return

      const ws = window.getSelection()
      if (ws?.rangeCount && containerRef.current?.contains(ws.getRangeAt(0).commonAncestorContainer)) {
        timeoutId = setTimeout(() => {
          processSelection()
          isSelecting = false
        }, 150)
      } else {
        isSelecting = false
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : (e.target as Node).parentElement
      if (!el) return
      if (el.closest("[data-selection-popover]") || el.closest('[role="dialog"]')) return
      // Skip input elements - calling clearSelection() on input clicks interferes with
      // the browser's text input handling, preventing users from typing in textareas/inputs.
      const tagName = (e.target as Element)?.tagName?.toLowerCase()
      if (tagName === "textarea" || tagName === "input") return
      if (containerRef.current && !containerRef.current.contains(el)) clearSelection()
    }

    document.addEventListener("selectstart", handleSelectStart)
    document.addEventListener("mouseup", handleMouseUp)
    document.addEventListener("click", handleClickOutside, true)

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      document.removeEventListener("selectstart", handleSelectStart)
      document.removeEventListener("mouseup", handleMouseUp)
      document.removeEventListener("click", handleClickOutside, true)
    }
  })

  return { selection, clearSelection }
}

// --- Provider ---

export function TextSelectionProvider({
  messages,
  containerRef,
  onSelect,
  highlightRanges = [],
  children,
}: {
  readonly messages: readonly (GenAIMessage | null)[]
  readonly containerRef: RefObject<HTMLElement | null>
  readonly onSelect?: ((anchor: TextSelectionAnchor, position: { x: number; y: number }) => void) | undefined
  readonly highlightRanges?: ReadonlyArray<HighlightRange> | undefined
  readonly children: ReactNode
}) {
  const { selection } = useTextSelectionHook(messages, containerRef, onSelect)

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

    // Add current selection as a transient highlight
    if (selection) {
      const key = `${selection.messageIndex}:${selection.partIndex}`
      let arr = map.get(key)
      if (!arr) {
        arr = []
        map.set(key, arr)
      }
      const isDuplicate = arr.some(
        (r) => r.startOffset === selection.startOffset && r.endOffset === selection.endOffset,
      )
      if (!isDuplicate) {
        arr.push({
          messageIndex: selection.messageIndex,
          partIndex: selection.partIndex,
          startOffset: selection.startOffset,
          endOffset: selection.endOffset,
          type: "selection",
        })
      }
    }

    return map
  }, [highlightRanges, selection])

  const getHighlightsForBlock = useCallback(
    (messageIndex: number, partIndex: number) => rangeIndex.get(`${messageIndex}:${partIndex}`) ?? [],
    [rangeIndex],
  )

  const value = useMemo<TextSelectionContextValue>(
    () => ({ selection, getHighlightsForBlock }),
    [selection, getHighlightsForBlock],
  )

  return <TextSelectionContext.Provider value={value}>{children}</TextSelectionContext.Provider>
}
