import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Message } from '@latitude-data/constants/legacyCompiler'
import { SelectedContext } from '@latitude-data/constants'

export type TextSelection = {
  context: SelectedContext
  selectedText: string
}

/**
 * Manages text selection within a message container and provides context about the selected text.
 *
 * This hook enables users to select text from message content blocks and tracks:
 * - Which message and content block the selection is from
 * - The exact text range (start/end offsets) within that content block
 * - The position for displaying a popover UI related to the selection
 *
 * The hook enforces several constraints:
 * - Only allows selection within a single message and single content type (text)
 * - Calculates accurate text offsets even when content spans multiple DOM text nodes
 * - Handles edge cases like clicks outside the container, clicks in popovers, and selection clearing
 *
 * The selection detection uses DOM data attributes (`data-message-index`, `data-content-block-index`,
 * `data-content-type`) to identify which message and content block the selection belongs to.
 *
 * @param messages - Array of Message objects to track selections within
 * @returns An object containing:
 *   - `selection`: The current text selection with context, or null if no selection
 *   - `popoverPosition`: The x/y coordinates for positioning a popover near the selection
 *   - `containerRef`: A ref to attach to the container element that contains the messages
 *   - `clearSelection`: Function to programmatically clear the current selection
 */
export function useTextSelection(messages: Message[]) {
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [popoverPosition, setPopoverPosition] = useState<{
    x: number
    y: number
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const clearSelection = useCallback(() => {
    setSelection(null)
    setPopoverPosition(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  /**
   * Processes the current browser text selection and updates the hook's state.
   *
   * This function:
   * 1. Validates the selection is within the container and contains text
   * 2. Identifies which message and content block the selection belongs to
   * 3. Ensures the selection is within a single content block of type 'text'
   * 4. Calculates accurate text offsets by traversing all text nodes in the content block
   * 5. Updates the selection state and popover position if valid, or clears it if invalid
   */
  const handleSelection = useCallback(() => {
    // INTERNAL METHODS
    // ------------------------------------------------------------
    /**
     * Traverses up the DOM tree from a given node to find data attributes
     * that identify which message and content block the node belongs to.
     *
     * Looks for:
     * - `data-message-index`: The index of the message in the messages array
     * - `data-content-block-index`: The index of the content block within the message
     * - `data-content-type`: The type of content (must be 'text')
     *
     * @param node - The DOM node to start searching from
     * @returns Object with messageIndex, contentBlockIndex, and contentType, or null if not found
     */
    const findIndices = (
      node: Node,
    ): {
      messageIndex: number
      contentBlockIndex: number
      contentType: 'text' | null
    } | null => {
      let element: HTMLElement | null =
        node.nodeType === Node.TEXT_NODE
          ? (node.parentElement as HTMLElement)
          : (node as HTMLElement)

      let messageIndex: number | null = null
      let contentBlockIndex: number | null = null
      let contentType: 'text' | null = null

      while (element) {
        if (messageIndex === null) {
          const msgIdx = element.getAttribute('data-message-index')
          if (msgIdx !== null) {
            messageIndex = parseInt(msgIdx)
          }
        }

        if (contentBlockIndex === null) {
          const blockIdx = element.getAttribute('data-content-block-index')
          if (blockIdx !== null) {
            contentBlockIndex = parseInt(blockIdx)
          }
        }

        if (contentType === null) {
          const type = element.getAttribute('data-content-type')
          if (type === 'text') contentType = type
        }

        if (messageIndex !== null && contentBlockIndex !== null) {
          break
        }

        element = element.parentElement
      }

      if (messageIndex !== null && contentBlockIndex !== null) {
        return {
          messageIndex,
          contentBlockIndex,
          contentType: contentType || 'text',
        }
      }

      return null
    }

    /**
     * Finds the root element of the content block that contains the given node.
     * The root element is identified by having a `data-content-block-index` attribute.
     *
     * @param node - The DOM node to start searching from
     * @returns The root HTMLElement of the content block, or null if not found
     */
    const findContentBlockRoot = (node: Node): HTMLElement | null => {
      let element: HTMLElement | null =
        node.nodeType === Node.TEXT_NODE
          ? (node.parentElement as HTMLElement)
          : (node as HTMLElement)

      while (element) {
        const blockIdx = element.getAttribute('data-content-block-index')
        if (blockIdx !== null) {
          return element
        }
        element = element.parentElement
      }
      return null
    }

    /**
     * Collects all text nodes within a content block root element using a TreeWalker.
     * This is used to calculate accurate text offsets when content spans multiple DOM text nodes.
     *
     * @param root - The root element of the content block
     * @returns Array of all Text nodes within the root element
     */
    const collectTextNodes = (root: HTMLElement): Text[] => {
      const textNodes: Text[] = []
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)

      let node: Node | null
      while ((node = walker.nextNode())) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent) {
          textNodes.push(node as Text)
        }
      }
      return textNodes
    }

    /**
     * Calculates absolute text offsets for a selection by iterating through all text nodes
     * in a content block and finding where the selection start/end containers fall.
     *
     * This handles cases where content spans multiple DOM text nodes by accumulating
     * the offset as it traverses through each text node.
     *
     * When text is split into groups, DOM text nodes might not match the original text
     * structure exactly. This method tries to find the selected text in the original
     * fullText and uses that position for more accurate offsets.
     *
     * @param textNodes - Array of all text nodes in the content block, in document order
     * @param startContainer - The DOM node where the selection starts
     * @param endContainer - The DOM node where the selection ends
     * @param range - The browser Selection range containing startOffset and endOffset
     * @param fullText - The original full text content from the content block
     * @param selectedText - The selected text string
     * @returns Object with textStart and textEnd offsets, or null if invalid
     */
    const calculateTextOffsets = (
      textNodes: Text[],
      startContainer: Node,
      endContainer: Node,
      range: Range,
      fullText: string,
      selectedText: string,
    ): { textStart: number; textEnd: number } | null => {
      let textStart = -1
      let textEnd = -1
      let currentOffset = 0

      for (const textNode of textNodes) {
        const textLength = textNode.textContent?.length || 0

        if (textNode === startContainer) {
          textStart = currentOffset + range.startOffset
        }

        if (textNode === endContainer) {
          textEnd = currentOffset + range.endOffset
        }

        currentOffset += textLength

        if (textStart >= 0 && textEnd >= 0) {
          break
        }
      }

      if (textStart < 0 || textEnd < 0 || textEnd <= textStart) {
        return null
      }

      // When text is split into groups, DOM text nodes might not match
      // the original text structure exactly. We need to map DOM offsets to original text offsets.
      // The DOM text should be a subset or transformation of fullText, so we'll try to find
      // the selected text in the original fullText and use that position.
      const selectedTextTrimmed = selectedText.trim()

      // Try to find the selected text in the original fullText to get accurate offsets
      // This handles cases where DOM structure differs from original text (e.g., grouped paragraphs)
      const selectedTextInFullText = fullText.indexOf(selectedTextTrimmed)

      if (selectedTextInFullText >= 0) {
        // Found the selected text in the original text - use that position
        // But we need to verify it's close to the DOM-calculated position to avoid false matches
        const domCalculatedStart = textStart
        const difference = Math.abs(selectedTextInFullText - domCalculatedStart)

        // If the difference is reasonable (within 50 chars), use the original text position
        // This handles cases where DOM structure causes slight offset differences
        if (difference < 50 || selectedTextInFullText < domCalculatedStart) {
          textStart = selectedTextInFullText
          textEnd = selectedTextInFullText + selectedTextTrimmed.length
        }
      }

      // Ensure offsets are within the original text bounds
      textStart = Math.max(0, Math.min(textStart, fullText.length))
      textEnd = Math.max(textStart + 1, Math.min(textEnd, fullText.length))

      return { textStart, textEnd }
    }

    // MAIN LOGIC
    // ------------------------------------------------------------
    const windowSelection = window.getSelection()
    if (!windowSelection || windowSelection.rangeCount === 0) {
      return
    }

    const range = windowSelection.getRangeAt(0)
    const selectedText = range.toString().trim()
    if (!selectedText) {
      if (selection) clearSelection()
      return
    }

    if (!containerRef.current) {
      clearSelection()
      return
    }

    if (
      !containerRef.current.contains(range.commonAncestorContainer) &&
      !containerRef.current.contains(range.startContainer) &&
      !containerRef.current.contains(range.endContainer)
    ) {
      clearSelection()
      return
    }

    const startContainer = range.startContainer
    const endContainer = range.endContainer

    const startIndices = findIndices(startContainer)
    const endIndices = findIndices(endContainer)

    if (!startIndices || !endIndices || !startIndices.contentType) {
      clearSelection()
      return
    }

    const isSingleBlockSelection =
      startIndices.messageIndex === endIndices.messageIndex &&
      startIndices.contentBlockIndex === endIndices.contentBlockIndex &&
      startIndices.contentType &&
      startIndices.contentType === 'text'

    if (!isSingleBlockSelection) {
      clearSelection()
      return
    }

    const message = messages[startIndices.messageIndex]
    if (!message) {
      clearSelection()
      return
    }

    const content = Array.isArray(message.content)
      ? message.content
      : [message.content]
    const contentBlock = content[startIndices.contentBlockIndex]

    if (!contentBlock || typeof contentBlock === 'string') {
      clearSelection()
      return
    }

    if (contentBlock.type !== 'text' && contentBlock.type !== 'reasoning') {
      clearSelection()
      return
    }

    const fullText = contentBlock.text || ''
    if (!fullText || !selectedText.trim()) {
      clearSelection()
      return
    }

    const contentBlockRoot = findContentBlockRoot(startContainer)
    if (!contentBlockRoot) {
      clearSelection()
      return
    }

    const textNodes = collectTextNodes(contentBlockRoot)
    const offsets = calculateTextOffsets(
      textNodes,
      startContainer,
      endContainer,
      range,
      fullText,
      selectedText,
    )

    if (!offsets) {
      console.warn('Invalid text range: could not calculate offsets')
      return
    }

    const { textStart, textEnd } = offsets

    const context: SelectedContext = {
      messageIndex: startIndices.messageIndex,
      contentBlockIndex: startIndices.contentBlockIndex,
      contentType: startIndices.contentType,
      textRange: {
        start: textStart,
        end: textEnd,
      },
      selectedText: selectedText.trim(),
    }

    setSelection({
      context,
      selectedText,
    })

    const rect = range.getBoundingClientRect()
    setPopoverPosition({
      x: rect.right,
      y: rect.top,
    })
  }, [messages, clearSelection, selection])

  // Event listeners for handling selection and popover positioning
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>
    let isSelecting = false

    const handleSelectStart = (e: Event) => {
      const target = e.target
      const element =
        target instanceof Element ? target : (target as Node).parentElement
      if (element && containerRef.current?.contains(element)) {
        isSelecting = true
      }
    }

    const handleMouseUp = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      if (!isSelecting) return

      const windowSelection = window.getSelection()
      if (
        windowSelection &&
        windowSelection.rangeCount > 0 &&
        containerRef.current?.contains(
          windowSelection.getRangeAt(0).commonAncestorContainer,
        )
      ) {
        timeoutId = setTimeout(() => {
          handleSelection()
          isSelecting = false
        }, 150)
      } else if (selection && isSelecting) {
        timeoutId = setTimeout(() => {
          const checkSelection = window.getSelection()
          if (
            checkSelection &&
            checkSelection.rangeCount > 0 &&
            checkSelection.toString().trim() &&
            containerRef.current?.contains(
              checkSelection.getRangeAt(0).commonAncestorContainer,
            )
          ) {
            handleSelection()
          } else {
            clearSelection()
          }
          isSelecting = false
        }, 200)
      } else {
        isSelecting = false
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target

      const element =
        target instanceof Element ? target : (target as Node).parentElement
      if (!element) return

      const isInsidePopover = element.closest('[data-selection-popover]')
      if (isInsidePopover) return

      if (containerRef.current && !containerRef.current.contains(element)) {
        clearSelection()
      }
    }

    document.addEventListener('selectstart', handleSelectStart)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('click', handleClickOutside, true)

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      document.removeEventListener('selectstart', handleSelectStart)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('click', handleClickOutside, true)
    }
  }, [handleSelection, clearSelection, selection])

  return useMemo(
    () => ({
      selection,
      popoverPosition,
      containerRef,
      clearSelection,
    }),
    [selection, popoverPosition, containerRef, clearSelection],
  )
}
