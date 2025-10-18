import type { JSX } from 'react'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { eventFiles } from '@lexical/rich-text'
import {
  calculateZoomLevel,
  isHTMLElement,
  mergeRegister,
} from '@lexical/utils'
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  LexicalEditor,
  LexicalNode,
} from 'lexical'
import React, {
  DragEvent as ReactDragEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@latitude-data/web-ui/utils'
import { Point } from './shared/point'
import { Rectangle } from './shared/rect'
import {
  getCollapsedMargins,
  hideTargetLine,
  setTargetLine,
} from './targetLine'

const DRAG_DATA_FORMAT = 'application/x-lexical-drag-block'

const Downward = 1
const Upward = -1
const Indeterminate = 0

let prevIndex = Infinity

function getCurrentIndex(keysLength: number): number {
  if (keysLength === 0) {
    return Infinity
  }
  if (prevIndex >= 0 && prevIndex < keysLength) {
    return prevIndex
  }

  return Math.floor(keysLength / 2)
}

function getTopLevelNodeKeys(editor: LexicalEditor): string[] {
  return editor.getEditorState().read(() => $getRoot().getChildrenKeys())
}

/**
 * Recursively removes empty custom blocks up the parent chain.
 *
 * This function handles cascading cleanup when dragging out content leaves
 * parent blocks empty. For example:
 * 1. Drag last paragraph from message → message becomes empty → remove message
 * 2. If that was the last message in step → step becomes empty → remove step
 * 3. Continue up the chain until we reach a non-empty parent or root
 *
 * @param nodeToCheck - The node to check for emptiness and potentially remove
 * @param excludeNode - Node to exclude from removal (usually the drop target)
 */
function removeEmptyParentBlocks({
  nodeToCheck,
  excludeNode,
  editor,
}: {
  nodeToCheck: LexicalNode
  excludeNode?: LexicalNode
  editor: LexicalEditor
}) {
  // Stop if checking the excluded node (usually the drop target)
  if (!nodeToCheck || nodeToCheck === excludeNode) {
    return
  }

  // Only process element nodes that can have children
  if (!$isElementNode(nodeToCheck)) {
    return
  }

  const element = editor.getElementByKey(nodeToCheck.getKey())

  // Only process custom blocks (step, message, etc.)
  if (!element?.hasAttribute('data-block-type')) {
    return
  }

  const remainingChildren = nodeToCheck.getChildren()

  // If this block is empty, remove it and check its parent
  if (remainingChildren.length === 0) {
    const parent = nodeToCheck.getParent()
    nodeToCheck.remove()

    // Recursively check if removing this node makes its parent empty
    if (parent) {
      removeEmptyParentBlocks({ nodeToCheck: parent, excludeNode, editor })
    }
  }
}

function getBlockElement(
  anchorElem: HTMLElement,
  editor: LexicalEditor,
  event: MouseEvent,
  useEdgeAsDefault = false,
): HTMLElement | null {
  const anchorElementRect = anchorElem.getBoundingClientRect()
  const topLevelNodeKeys = getTopLevelNodeKeys(editor)

  let blockElem: HTMLElement | null = null

  editor.getEditorState().read(() => {
    if (useEdgeAsDefault) {
      const [firstNode, lastNode] = [
        topLevelNodeKeys[0]
          ? editor.getElementByKey(topLevelNodeKeys[0])
          : null,
        topLevelNodeKeys.length > 0
          ? editor.getElementByKey(
              topLevelNodeKeys[topLevelNodeKeys.length - 1]!,
            )
          : null,
      ]

      const [firstNodeRect, lastNodeRect] = [
        firstNode != null ? firstNode.getBoundingClientRect() : undefined,
        lastNode != null ? lastNode.getBoundingClientRect() : undefined,
      ]

      if (firstNodeRect && lastNodeRect) {
        const firstNodeZoom = calculateZoomLevel(firstNode)
        const lastNodeZoom = calculateZoomLevel(lastNode)
        if (event.y / firstNodeZoom < firstNodeRect.top) {
          blockElem = firstNode
        } else if (event.y / lastNodeZoom > lastNodeRect.bottom) {
          blockElem = lastNode
        }

        if (blockElem) {
          return
        }
      }
    }

    let index = getCurrentIndex(topLevelNodeKeys.length)
    let direction = Indeterminate

    while (index >= 0 && index < topLevelNodeKeys.length) {
      const key = topLevelNodeKeys[index]
      if (!key) break
      const elem = editor.getElementByKey(key)
      if (elem === null) {
        break
      }
      const zoom = calculateZoomLevel(elem)
      const point = new Point(event.x / zoom, event.y / zoom)
      const domRect = Rectangle.fromDOM(elem)
      const { marginTop, marginBottom } = getCollapsedMargins(elem)
      const rect = domRect.generateNewRect({
        bottom: domRect.bottom + marginBottom,
        left: anchorElementRect.left,
        right: anchorElementRect.right,
        top: domRect.top - marginTop,
      })

      const {
        result,
        reason: { isOnTopSide, isOnBottomSide },
      } = rect.contains(point)

      if (result) {
        blockElem = elem
        prevIndex = index
        break
      }

      if (direction === Indeterminate) {
        if (isOnTopSide) {
          direction = Upward
        } else if (isOnBottomSide) {
          direction = Downward
        } else {
          // stop search block element
          direction = Infinity
        }
      }

      index += direction
    }
  })

  return blockElem
}

function getAnyBlockElement(
  anchorElem: HTMLElement,
  editor: LexicalEditor,
  event: MouseEvent,
): HTMLElement | null {
  if (!isHTMLElement(event.target)) return null

  const editorElement = editor.getRootElement()
  if (!editorElement) return null

  // Simple approach: collect all draggable candidates by walking up the DOM
  const candidates: HTMLElement[] = []
  let currentElement: HTMLElement | null = event.target

  // Ensure we're within the editor
  if (!editorElement.contains(currentElement)) return null
  if (editorElement.isEqualNode(currentElement)) return null

  while (currentElement) {
    if (
      currentElement.tagName === 'P' ||
      currentElement.hasAttribute('data-block-type')
    ) {
      candidates.push(currentElement)
    }
    currentElement = currentElement.parentElement
  }

  if (candidates.length === 0) {
    return getBlockElement(anchorElem, editor, event, false)
  }

  // Simple rule: if we're inside a content area, return innermost; otherwise return nearest block
  let targetElement: Element | null = event.target
  let isInsideContentArea = false

  // Check if we're inside any content area
  while (targetElement && targetElement !== editorElement) {
    if (targetElement.hasAttribute('data-content-area')) {
      isInsideContentArea = true
      break
    }
    targetElement = targetElement.parentElement
  }

  if (isInsideContentArea) {
    // Inside content area → return innermost draggable element
    return candidates[0] || null
  } else {
    // Outside content area → return the nearest block container
    // Find the nearest custom block
    for (const candidate of candidates) {
      if (candidate.hasAttribute('data-block-type')) {
        return candidate
      }
    }
    return candidates[0] || null
  }
}

function setMenuPosition(
  targetElem: HTMLElement | null,
  floatingElem: HTMLElement,
  anchorElem: HTMLElement,
  menuComponentWidth: number,
) {
  if (!targetElem) {
    floatingElem.style.opacity = '0'
    floatingElem.style.transform = 'translate(-10000px, -10000px)'
    return
  }

  const targetRect = targetElem.getBoundingClientRect()
  const targetStyle = window.getComputedStyle(targetElem)
  const floatingElemRect = floatingElem.getBoundingClientRect()
  const anchorElementRect = anchorElem.getBoundingClientRect()

  const topOffset = 0
  let targetCalculateHeight: number = parseInt(targetStyle.lineHeight, 10)

  if (isNaN(targetCalculateHeight)) {
    targetCalculateHeight = targetRect.bottom - targetRect.top
  }
  const top =
    targetRect.top +
    topOffset +
    (targetCalculateHeight - floatingElemRect.height) / 2 -
    anchorElementRect.top

  const left = targetRect.left - menuComponentWidth

  floatingElem.style.opacity = '1'
  floatingElem.style.transform = `translate(${left}px, ${top}px)`
}

function setDragImage(
  dataTransfer: DataTransfer,
  draggableBlockElem: HTMLElement,
) {
  const dragImg = document.createElement('div')
  dragImg.className = cn(
    'border border-primary/90 bg-primary/40',
    'rounded pointer-events-none',
  )
  dragImg.style.width = `${draggableBlockElem.offsetWidth}px`
  dragImg.style.height = `${draggableBlockElem.offsetHeight}px`

  document.body.appendChild(dragImg)
  dataTransfer.setDragImage(dragImg, 0, 0)

  setTimeout(() => {
    document.body.removeChild(dragImg)
  }, 0)
}

function useDraggableBlockMenu(
  editor: LexicalEditor,
  anchorElem: HTMLElement,
  menuRef: React.RefObject<HTMLElement | null>,
  targetLineRef: React.RefObject<HTMLElement | null>,
  isEditable: boolean,
  menuComponent: ReactNode,
  menuComponentWidth: number,
  targetLineComponent: ReactNode,
  isOnMenu: (element: HTMLElement) => boolean,
  onElementChanged?: (element: HTMLElement | null) => void,
  canDropInside?: (node: LexicalNode) => boolean,
  validateDrop?: (draggedNode: LexicalNode, targetNode: LexicalNode) => boolean,
): JSX.Element {
  const scrollerElem = anchorElem.parentElement

  const isDraggingBlockRef = useRef<boolean>(false)
  const [draggableBlockElem, setDraggableBlockElemState] =
    useState<HTMLElement | null>(null)

  const setDraggableBlockElem = useCallback(
    (elem: HTMLElement | null) => {
      setDraggableBlockElemState(elem)
      if (onElementChanged) {
        onElementChanged(elem)
      }
    },
    [onElementChanged],
  )

  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      const target = event.target
      if (!isHTMLElement(target)) {
        setDraggableBlockElem(null)
        return
      }

      if (isOnMenu(target as HTMLElement)) {
        return
      }

      const _draggableBlockElem = getAnyBlockElement(anchorElem, editor, event)

      setDraggableBlockElem(_draggableBlockElem)
    }

    function onMouseLeave() {
      setDraggableBlockElem(null)
    }

    if (scrollerElem != null) {
      scrollerElem.addEventListener('mousemove', onMouseMove)
      scrollerElem.addEventListener('mouseleave', onMouseLeave)
    }

    return () => {
      if (scrollerElem != null) {
        scrollerElem.removeEventListener('mousemove', onMouseMove)
        scrollerElem.removeEventListener('mouseleave', onMouseLeave)
      }
    }
  }, [
    scrollerElem,
    anchorElem,
    editor,
    isOnMenu,
    setDraggableBlockElem,
    canDropInside,
  ])

  useEffect(() => {
    if (menuRef.current) {
      setMenuPosition(
        draggableBlockElem,
        menuRef.current,
        anchorElem,
        menuComponentWidth,
      )
    }
  }, [anchorElem, draggableBlockElem, menuRef, menuComponentWidth])

  useEffect(() => {
    // Helper function to calculate drop mode based on mouse position and target capabilities
    function calculateDropMode(
      mouseY: number,
      targetBlockElem: HTMLElement,
      targetNode: LexicalNode,
      canDropInside?: (node: LexicalNode) => boolean,
      validateDrop?: (
        draggedNode: LexicalNode,
        targetNode: LexicalNode,
      ) => boolean,
      draggedNode?: LexicalNode,
      isHoveringOutsideContent?: boolean,
    ): {
      mode: 'inside' | 'before' | 'after'
      shouldDropInside: boolean
      isValidDrop: boolean
    } {
      // If hovering outside content area, determine the correct drop mode
      if (isHoveringOutsideContent) {
        let isValidDrop = false

        // Check if the target is the custom block itself (empty content area)
        const isTargetCustomBlock =
          targetBlockElem.hasAttribute('data-block-type')

        if (isTargetCustomBlock) {
          // Hovering outside content of empty custom block - use "inside" mode
          if (validateDrop && draggedNode) {
            isValidDrop = validateDrop(draggedNode, targetNode)
          } else {
            isValidDrop = true
          }
          return { mode: 'inside', shouldDropInside: true, isValidDrop }
        } else {
          // Hovering outside content but found first element - use "before" mode
          const targetParent = targetNode.getParent()

          if (targetParent && validateDrop && draggedNode) {
            isValidDrop = validateDrop(draggedNode, targetParent)
          } else if (validateDrop && draggedNode) {
            isValidDrop = validateDrop(draggedNode, targetNode)
          } else {
            isValidDrop = true
          }

          return { mode: 'before', shouldDropInside: false, isValidDrop }
        }
      }

      const targetBlockRect = targetBlockElem.getBoundingClientRect()
      const relativeY = mouseY - targetBlockRect.top
      const containerHeight = targetBlockRect.height

      if (!validateDrop || !draggedNode) {
        // Without validation, default to simple positioning with expanded zones
        const expandedThreshold = containerHeight * 0.4 // Expand the middle zone
        if (relativeY < expandedThreshold) {
          return { mode: 'before', shouldDropInside: false, isValidDrop: true }
        } else {
          return { mode: 'after', shouldDropInside: false, isValidDrop: true }
        }
      }

      // Check if we can drop inside the container
      const canDropInsideTarget = canDropInside && canDropInside(targetNode)
      const isValidInsideDrop =
        canDropInsideTarget && validateDrop(draggedNode, targetNode)

      if (isValidInsideDrop) {
        // Expand the inside drop zone significantly to reduce jumping
        const edgeThreshold = Math.min(30, containerHeight * 0.3) // Increased from 20px/20% to 30px/30%
        const isInInsideArea =
          relativeY > edgeThreshold &&
          relativeY < containerHeight - edgeThreshold &&
          containerHeight > 60 // Increased minimum height from 40 to 60

        if (isInInsideArea) {
          return { mode: 'inside', shouldDropInside: true, isValidDrop: true }
        }
      }

      // For before/after drops, validate against the parent (we're dropping at the same level as target)
      const targetParent = targetNode.getParent()
      let isValidSiblingDrop = false

      if (targetParent) {
        isValidSiblingDrop = validateDrop(draggedNode, targetParent)
      } else {
        // Root level - use general validation rules
        isValidSiblingDrop = validateDrop(draggedNode, targetNode)
      }

      // Use expanded zones for before/after to reduce jumping
      // Create larger "before" zone and smaller "after" zone, or vice versa based on hysteresis
      const beforeThreshold = containerHeight * 0.4 // Expanded from 0.5 to 0.4
      const mode = relativeY < beforeThreshold ? 'before' : 'after'

      return {
        mode,
        shouldDropInside: false,
        isValidDrop: isValidSiblingDrop,
      }
    }

    function onDragover(event: DragEvent): boolean {
      if (!isDraggingBlockRef.current) {
        return false
      }
      const [isFileTransfer] = eventFiles(event)
      if (isFileTransfer) {
        return false
      }
      const { pageY, target } = event
      if (!isHTMLElement(target)) {
        return false
      }

      // Check if we're hovering over any part of a custom block but outside its content area
      const customBlock = target.closest('[data-block-type]')
      const isInContentArea = target.closest('[data-content-area]')
      const isHoveringOutsideContent = customBlock && !isInContentArea

      const preciseTargetNode = $getNearestNodeFromDOMNode(target)
      let targetBlockElem: HTMLElement | null = null

      if (isHoveringOutsideContent && customBlock) {
        // Generic logic: find the first position in the content area of this custom block
        const contentArea = customBlock.querySelector('[data-content-area]')

        if (contentArea) {
          // Try to find the first draggable element in the content area
          const firstElement = contentArea.querySelector('p, [data-block-type]')

          if (firstElement) {
            // Found existing content - target the first element for "before" mode
            const firstNode = $getNearestNodeFromDOMNode(
              firstElement as HTMLElement,
            )
            if (firstNode) {
              targetBlockElem = editor.getElementByKey(firstNode.getKey())
            }
          } else {
            // No content in the area - target the custom block itself for "inside" mode
            const customBlockNode = $getNearestNodeFromDOMNode(
              customBlock as HTMLElement,
            )
            if (customBlockNode) {
              targetBlockElem = editor.getElementByKey(customBlockNode.getKey())
            }
          }
        }

        // Fallback: if content area not found, use the custom block
        if (!targetBlockElem) {
          const customBlockNode = $getNearestNodeFromDOMNode(
            customBlock as HTMLElement,
          )
          if (customBlockNode) {
            targetBlockElem = editor.getElementByKey(customBlockNode.getKey())
          }
        }
      } else if (preciseTargetNode) {
        targetBlockElem = editor.getElementByKey(preciseTargetNode.getKey())
      } else {
        // Find the block element in the root blocks
        targetBlockElem = getBlockElement(anchorElem, editor, event, true)
      }

      const targetLineElem = targetLineRef.current
      if (!targetBlockElem || !targetLineElem) return false

      // Avoid showing drop indicator when target is the same as or inside the draggable element
      if (
        targetBlockElem === draggableBlockElem ||
        (draggableBlockElem && draggableBlockElem.contains(targetBlockElem))
      ) {
        hideTargetLine(targetLineElem)
        return false
      }

      const mouseY = pageY / calculateZoomLevel(target)
      let showDropIndicator = false

      // Check if this is a valid drop position
      if (draggableBlockElem && canDropInside && validateDrop) {
        const draggedNode = $getNearestNodeFromDOMNode(draggableBlockElem)
        const targetNode = $getNearestNodeFromDOMNode(targetBlockElem)

        if (draggedNode && targetNode) {
          // Allow drops even when draggedNode === targetNode in certain cases
          // This handles reordering within the same container
          const isDroppingOnSelf = draggedNode === targetNode
          const isReorderingWithinParent =
            isDroppingOnSelf &&
            draggedNode.getParent() === targetNode.getParent()

          if (draggedNode !== targetNode || isReorderingWithinParent) {
            // Calculate the drop mode and get validation info
            const { mode: dropMode, isValidDrop } = calculateDropMode(
              mouseY,
              targetBlockElem,
              targetNode,
              canDropInside,
              validateDrop,
              draggedNode,
              isHoveringOutsideContent || false, // Pass outside content hovering info
            )

            if (isValidDrop) {
              showDropIndicator = true

              setTargetLine(
                targetLineElem,
                targetBlockElem,
                mouseY,
                anchorElem,
                dropMode,
              )
            }
          }
        }
      }

      // Hide target line if we're not showing a drop indicator
      if (!showDropIndicator) {
        hideTargetLine(targetLineElem)
      }

      // Prevent default event to be able to trigger onDrop events
      event.preventDefault()
      return true
    }
    function $onDrop(event: DragEvent): boolean {
      if (!isDraggingBlockRef.current) {
        return false
      }
      const [isFileTransfer] = eventFiles(event)
      if (isFileTransfer) {
        return false
      }
      const { target, dataTransfer, pageY } = event
      const dragData =
        dataTransfer != null ? dataTransfer.getData(DRAG_DATA_FORMAT) : ''
      const draggedNode = $getNodeByKey(dragData)
      if (!draggedNode) {
        return false
      }
      if (!isHTMLElement(target)) {
        return false
      }

      // Try to get the precise target element first (since we're in command context)
      const preciseTargetNode = $getNearestNodeFromDOMNode(target)
      let targetBlockElem: HTMLElement | null = null

      if (preciseTargetNode) {
        targetBlockElem = editor.getElementByKey(preciseTargetNode.getKey())
      }

      // Fallback to traditional block element search if precise targeting fails
      if (!targetBlockElem) {
        targetBlockElem = getBlockElement(anchorElem, editor, event, true)
      }

      if (!targetBlockElem) {
        return false
      }

      // Avoid dropping on the same element as or inside the draggable element
      if (
        targetBlockElem === draggableBlockElem ||
        (draggableBlockElem && draggableBlockElem.contains(targetBlockElem))
      ) {
        return true // Consume the event but don't perform the drop
      }

      // Use the precise target if available, otherwise get from the element
      const targetNode =
        preciseTargetNode || $getNearestNodeFromDOMNode(targetBlockElem)
      if (!targetNode) {
        return false
      }

      // Allow reordering within the same parent, but prevent actual self-drops
      const isDroppingOnSelf = targetNode === draggedNode
      const isReorderingWithinParent =
        isDroppingOnSelf && draggedNode.getParent() === targetNode.getParent()

      if (isDroppingOnSelf && !isReorderingWithinParent) {
        return true // Prevent actual self-drops but allow reordering
      }

      // Validate the drop before performing it
      const { shouldDropInside, mode, isValidDrop } = calculateDropMode(
        pageY / calculateZoomLevel(target),
        targetBlockElem,
        targetNode,
        canDropInside,
        validateDrop,
        draggedNode,
        false, // Not hovering outside content during drop
      )

      if (!isValidDrop) {
        return true // Consume the event but don't perform the drop
      }

      // Store the original parent before moving the node
      const originalParent = draggedNode.getParent()

      if (shouldDropInside) {
        // Drop inside the container (append as child)
        // Only ElementNodes can have children
        if ($isElementNode(targetNode)) {
          // With Lexical's slot system, children are automatically placed in the content area
          targetNode.append(draggedNode)
        } else {
          // Fallback to inserting after if can't append
          targetNode.insertAfter(draggedNode)
        }
      } else {
        // Drop between siblings (insert before/after) based on calculated mode

        // Special handling for moving within the same parent
        const draggedParent = draggedNode.getParent()
        const targetParent = targetNode.getParent()
        const isSameParent = draggedParent === targetParent

        if (mode === 'before') {
          if (isSameParent && $isElementNode(draggedParent)) {
            // When moving within the same parent, we need to be more careful
            const children = draggedParent.getChildren()
            const targetIndex = children.indexOf(targetNode)
            const draggedIndex = children.indexOf(draggedNode)

            // Only proceed if we're actually changing position
            if (
              targetIndex !== -1 &&
              draggedIndex !== -1 &&
              draggedIndex !== targetIndex - 1
            ) {
              // For moving to the beginning, ensure we don't skip if target is first element
              if (targetIndex === 0 || draggedIndex > targetIndex) {
                draggedNode.remove()
                targetNode.insertBefore(draggedNode)
              } else if (draggedIndex < targetIndex) {
                // Moving forward in the list
                draggedNode.remove()
                targetNode.insertBefore(draggedNode)
              }
            }
          } else {
            targetNode.insertBefore(draggedNode)
          }
        } else {
          if (isSameParent && $isElementNode(draggedParent)) {
            // Similar handling for 'after' mode
            const children = draggedParent.getChildren()
            const targetIndex = children.indexOf(targetNode)
            const draggedIndex = children.indexOf(draggedNode)

            // Only proceed if we're actually changing position
            if (
              targetIndex !== -1 &&
              draggedIndex !== -1 &&
              draggedIndex !== targetIndex + 1
            ) {
              draggedNode.remove()
              targetNode.insertAfter(draggedNode)
            }
          } else {
            targetNode.insertAfter(draggedNode)
          }
        }
      }

      // Check if the original parent is now empty and should be removed
      // This handles the case where dragging out the last child leaves an empty custom block
      if (originalParent && originalParent !== targetNode) {
        removeEmptyParentBlocks({
          nodeToCheck: originalParent,
          excludeNode: draggedNode,
          editor,
        })
      }

      setDraggableBlockElem(null)

      return true
    }

    return mergeRegister(
      editor.registerCommand(
        DRAGOVER_COMMAND,
        (event) => {
          return onDragover(event)
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        DROP_COMMAND,
        (event) => {
          return $onDrop(event)
        },
        COMMAND_PRIORITY_HIGH,
      ),
    )
  }, [
    anchorElem,
    editor,
    targetLineRef,
    setDraggableBlockElem,
    validateDrop,
    canDropInside,
    draggableBlockElem,
  ])

  function onDragStart(event: ReactDragEvent<HTMLDivElement>): void {
    const dataTransfer = event.dataTransfer
    if (!dataTransfer || !draggableBlockElem) {
      return
    }
    setDragImage(dataTransfer, draggableBlockElem)
    let nodeKey = ''
    editor.update(() => {
      const node = $getNearestNodeFromDOMNode(draggableBlockElem)
      if (node) {
        nodeKey = node.getKey()
      }
    })
    isDraggingBlockRef.current = true
    dataTransfer.setData(DRAG_DATA_FORMAT, nodeKey)
  }

  function onDragEnd(): void {
    isDraggingBlockRef.current = false
    hideTargetLine(targetLineRef.current)
  }
  return createPortal(
    <>
      <div draggable={true} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        {isEditable && menuComponent}
      </div>
      {targetLineComponent}
    </>,
    anchorElem,
  )
}

export function DraggableBlockPlugin_EXPERIMENTAL({
  anchorElem = document.body,
  menuRef,
  targetLineRef,
  menuComponent,
  menuComponentWidth,
  targetLineComponent,
  isOnMenu,
  onElementChanged,
  canDropInside,
  validateDrop,
}: {
  anchorElem?: HTMLElement
  menuRef: React.RefObject<HTMLElement | null>
  targetLineRef: React.RefObject<HTMLElement | null>
  menuComponent: ReactNode
  menuComponentWidth: number
  targetLineComponent: ReactNode
  isOnMenu: (element: HTMLElement) => boolean
  onElementChanged?: (element: HTMLElement | null) => void
  canDropInside?: (node: LexicalNode) => boolean
  validateDrop?: (draggedNode: LexicalNode, targetNode: LexicalNode) => boolean
}): JSX.Element {
  const [editor] = useLexicalComposerContext()
  return useDraggableBlockMenu(
    editor,
    anchorElem,
    menuRef,
    targetLineRef,
    editor._editable,
    menuComponent,
    menuComponentWidth,
    targetLineComponent,
    isOnMenu,
    onElementChanged,
    canDropInside,
    validateDrop,
  )
}
