import { useCallback, useEffect, useRef } from "react"
import type { AnnotationRecord } from "../../../../../../../domains/annotations/annotations.functions.ts"
import type { TextSelectionPopoverControls } from "./use-annotation-popover.ts"

const HIGHLIGHT_BOX_SHADOW = "0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--primary) / 0.5)"
const HIGHLIGHT_DURATION_MS = 4000
const POPOVER_VIEWPORT_PADDING = 24
/**
 * `scrollend` does not bubble — it fires only on the element whose scroll offset changed.
 * `scrollIntoView` may scroll an ancestor of `container`, so we walk up from the target.
 */
function findScrollport(element: HTMLElement, root: HTMLElement): HTMLElement {
  let node: HTMLElement | null = element
  while (node) {
    if (node === root) {
      return root
    }
    const { overflowY } = getComputedStyle(node)
    const canScrollY = node.scrollHeight > node.clientHeight + 1
    if (canScrollY && (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay")) {
      return node
    }
    node = node.parentElement
    if (node && !root.contains(node)) {
      return root
    }
  }
  return root
}

export function isGlobalAnnotation(annotation: AnnotationRecord): boolean {
  return annotation.metadata.messageIndex === undefined
}

interface UseAnnotationNavigationOptions {
  scrollContainerRef: React.RefObject<HTMLElement | null>
  onSwitchToConversation?: () => void
  /** Whether the conversation view is currently active/visible. When false, uses pending navigation. */
  isConversationActive?: boolean
  textSelectionPopoverControlsRef?: React.RefObject<TextSelectionPopoverControls | null>
}

interface ScrollToElementOptions {
  readonly element: HTMLElement
  readonly clickTarget: HTMLElement | null
  readonly annotation: AnnotationRecord
  readonly openTextSelectionPopoverImmediately?: boolean
}

export function useAnnotationNavigation({
  scrollContainerRef,
  onSwitchToConversation,
  isConversationActive = true,
  textSelectionPopoverControlsRef,
}: UseAnnotationNavigationOptions) {
  const pendingAnnotationRef = useRef<AnnotationRecord | null>(null)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentHighlightRef = useRef<HTMLElement | null>(null)
  const popoverCardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentPopoverCardRef = useRef<HTMLElement | null>(null)
  const observerRef = useRef<MutationObserver | null>(null)
  const observerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearObserver = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    if (observerTimeoutRef.current) {
      clearTimeout(observerTimeoutRef.current)
      observerTimeoutRef.current = null
    }
  }, [])

  const clearPopoverCardHighlight = useCallback(() => {
    if (popoverCardTimeoutRef.current) {
      clearTimeout(popoverCardTimeoutRef.current)
      popoverCardTimeoutRef.current = null
    }
    if (currentPopoverCardRef.current) {
      currentPopoverCardRef.current.style.boxShadow = ""
      currentPopoverCardRef.current = null
    }
  }, [])

  const clearHighlight = useCallback(() => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current)
      highlightTimeoutRef.current = null
    }
    if (currentHighlightRef.current) {
      currentHighlightRef.current.style.boxShadow = ""
      currentHighlightRef.current = null
    }
  }, [])

  const clearAll = useCallback(() => {
    clearHighlight()
    clearPopoverCardHighlight()
    clearObserver()
  }, [clearHighlight, clearPopoverCardHighlight, clearObserver])

  useEffect(() => () => clearAll(), [clearAll])

  const applyHighlight = useCallback((element: HTMLElement) => {
    if (currentHighlightRef.current === element) {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current)
      }
    } else {
      const prevElement = currentHighlightRef.current
      element.style.boxShadow = HIGHLIGHT_BOX_SHADOW
      currentHighlightRef.current = element
      if (prevElement) {
        prevElement.style.boxShadow = ""
      }
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current)
      }
    }

    highlightTimeoutRef.current = setTimeout(() => {
      element.style.boxShadow = ""
      currentHighlightRef.current = null
      highlightTimeoutRef.current = null
    }, HIGHLIGHT_DURATION_MS)
  }, [])

  const highlightAnnotationInPopover = useCallback(
    (annotationId: string) => {
      const applyCardHighlight = (card: HTMLElement) => {
        if (currentPopoverCardRef.current === card) {
          if (popoverCardTimeoutRef.current) {
            clearTimeout(popoverCardTimeoutRef.current)
          }
        } else {
          const prevCard = currentPopoverCardRef.current
          card.style.boxShadow = HIGHLIGHT_BOX_SHADOW
          card.focus({ preventScroll: true })
          card.scrollIntoView({ behavior: "instant", block: "nearest" })
          currentPopoverCardRef.current = card
          if (prevCard) {
            prevCard.style.boxShadow = ""
          }
          if (popoverCardTimeoutRef.current) {
            clearTimeout(popoverCardTimeoutRef.current)
          }
        }
        popoverCardTimeoutRef.current = setTimeout(() => {
          card.style.boxShadow = ""
          currentPopoverCardRef.current = null
          popoverCardTimeoutRef.current = null
        }, HIGHLIGHT_DURATION_MS)
      }

      const popover = document.querySelector("[data-radix-popper-content-wrapper]")
      if (popover) {
        const card = popover.querySelector<HTMLElement>(`[data-annotation-card-id="${annotationId}"]`)
        if (card) {
          applyCardHighlight(card)
          return
        }
      }

      clearObserver()
      const observer = new MutationObserver((_, obs) => {
        const pop = document.querySelector("[data-radix-popper-content-wrapper]")
        if (pop) {
          const card = pop.querySelector<HTMLElement>(`[data-annotation-card-id="${annotationId}"]`)
          if (card) {
            obs.disconnect()
            observerRef.current = null
            applyCardHighlight(card)
          }
        }
      })

      observerRef.current = observer
      observer.observe(document.body, { childList: true, subtree: true })

      observerTimeoutRef.current = setTimeout(() => {
        observer.disconnect()
        observerRef.current = null
        observerTimeoutRef.current = null
      }, 3000)
    },
    [clearPopoverCardHighlight, clearObserver],
  )

  const getTextSelectionPopoverPosition = useCallback((element: HTMLElement, annotationId: string) => {
    const partRoot = element.closest("[data-part-index]") ?? document.body
    const segments = partRoot.querySelectorAll<HTMLElement>(`[data-annotation-id="${annotationId}"]`)

    let left = Number.POSITIVE_INFINITY
    let bottom = Number.NEGATIVE_INFINITY

    if (segments.length > 0) {
      for (const segment of segments) {
        const rect = segment.getBoundingClientRect()
        if (rect.left < left) left = rect.left
        if (rect.bottom > bottom) bottom = rect.bottom
      }
    } else {
      const rect = element.getBoundingClientRect()
      left = rect.left
      bottom = rect.bottom
    }

    const maxX = Math.max(POPOVER_VIEWPORT_PADDING, window.innerWidth - POPOVER_VIEWPORT_PADDING)
    const maxY = Math.max(POPOVER_VIEWPORT_PADDING, window.innerHeight - POPOVER_VIEWPORT_PADDING)

    return {
      x: Math.min(Math.max(left, POPOVER_VIEWPORT_PADDING), maxX),
      y: Math.min(Math.max(bottom, POPOVER_VIEWPORT_PADDING), maxY),
    }
  }, [])

  const scrollToElement = useCallback(
    ({ element, clickTarget, annotation, openTextSelectionPopoverImmediately = false }: ScrollToElementOptions) => {
      const container = scrollContainerRef.current

      const openAndSelectAnnotation = () => {
        if (openTextSelectionPopoverImmediately) {
          const controls = textSelectionPopoverControlsRef?.current
          if (controls) {
            controls.openExistingAnnotationPopover(annotation, getTextSelectionPopoverPosition(element, annotation.id))
            highlightAnnotationInPopover(annotation.id)
            return
          }
        }

        applyHighlight(element)

        const popover = document.querySelector("[data-radix-popper-content-wrapper]")
        const cardInPopover = popover?.querySelector(`[data-annotation-card-id="${annotation.id}"]`)

        if (cardInPopover) {
          highlightAnnotationInPopover(annotation.id)
          return
        }

        if (clickTarget) {
          clickTarget.click()
          highlightAnnotationInPopover(annotation.id)
        }
      }

      if (container) {
        let handled = false
        const scrollTarget = findScrollport(element, container)
        const scrollTopBefore = scrollTarget.scrollTop

        const cleanup = () => {
          scrollTarget.removeEventListener("scrollend", onScrollEnd)
        }

        const onScrollEnd = () => {
          if (handled) return
          handled = true
          cleanup()
          openAndSelectAnnotation()
        }

        scrollTarget.addEventListener("scrollend", onScrollEnd, { once: true })

        element.scrollIntoView({ behavior: "smooth", block: "center" })

        // `scrollend` only fires if a scroll actually happens. When the element is
        // already in view, scrollIntoView is a no-op — fall through to openAndSelect
        // on the next frame if scrollTop didn't change.
        requestAnimationFrame(() => {
          if (handled) return
          if (scrollTarget.scrollTop === scrollTopBefore) {
            handled = true
            cleanup()
            openAndSelectAnnotation()
          }
        })
      } else {
        element.scrollIntoView({ behavior: "instant", block: "center" })
        openAndSelectAnnotation()
      }
    },
    [
      scrollContainerRef,
      textSelectionPopoverControlsRef,
      applyHighlight,
      getTextSelectionPopoverPosition,
      highlightAnnotationInPopover,
    ],
  )

  const findAndScrollToAnnotation = useCallback(
    (annotation: AnnotationRecord) => {
      clearObserver()

      const container = scrollContainerRef.current
      if (!container) return false

      const { messageIndex, partIndex, startOffset, endOffset } = annotation.metadata
      const isTextSelection =
        messageIndex !== undefined && partIndex !== undefined && startOffset !== undefined && endOffset !== undefined

      if (isTextSelection) {
        const textElement = container.querySelector<HTMLElement>(`[data-annotation-id="${annotation.id}"]`)
        if (textElement) {
          scrollToElement({
            element: textElement,
            clickTarget: textElement,
            annotation,
            openTextSelectionPopoverImmediately: true,
          })
          return true
        }

        const observer = new MutationObserver((_, obs) => {
          const element = container.querySelector<HTMLElement>(`[data-annotation-id="${annotation.id}"]`)
          if (element) {
            obs.disconnect()
            observerRef.current = null
            scrollToElement({
              element,
              clickTarget: element,
              annotation,
              openTextSelectionPopoverImmediately: true,
            })
          }
        })

        observerRef.current = observer
        observer.observe(container, { childList: true, subtree: true })
        observerTimeoutRef.current = setTimeout(() => {
          observer.disconnect()
          observerRef.current = null
          observerTimeoutRef.current = null
        }, 5000)
        return false
      }

      if (messageIndex !== undefined) {
        const messageElement = container.querySelector<HTMLElement>(`[data-message-index="${messageIndex}"]`)
        const triggerElement = container.querySelector<HTMLElement>(
          `[data-message-annotation-trigger="${messageIndex}"]`,
        )
        if (messageElement) {
          scrollToElement({
            element: messageElement,
            clickTarget: triggerElement,
            annotation,
          })
          return true
        }
      }

      return false
    },
    [scrollContainerRef, scrollToElement, clearObserver],
  )

  const scrollToAnnotation = useCallback(
    (annotation: AnnotationRecord) => {
      if (isGlobalAnnotation(annotation)) return

      if (!isConversationActive && onSwitchToConversation) {
        pendingAnnotationRef.current = annotation
        onSwitchToConversation()
        return
      }

      findAndScrollToAnnotation(annotation)
    },
    [findAndScrollToAnnotation, onSwitchToConversation, isConversationActive],
  )

  const executePendingScroll = useCallback(() => {
    if (pendingAnnotationRef.current) {
      requestAnimationFrame(() => {
        if (pendingAnnotationRef.current) {
          findAndScrollToAnnotation(pendingAnnotationRef.current)
          pendingAnnotationRef.current = null
        }
      })
    }
  }, [findAndScrollToAnnotation])

  return {
    scrollToAnnotation,
    executePendingScroll,
    clearHighlight: clearAll,
  }
}
