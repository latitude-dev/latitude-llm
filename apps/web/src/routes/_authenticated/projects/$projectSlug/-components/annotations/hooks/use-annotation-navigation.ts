import { useCallback, useEffect, useRef } from "react"
import type { AnnotationRecord } from "../../../../../../../domains/annotations/annotations.functions.ts"

const HIGHLIGHT_BOX_SHADOW = "0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--primary) / 0.5)"
const HIGHLIGHT_DURATION_MS = 4000

export function isGlobalAnnotation(annotation: AnnotationRecord): boolean {
  return annotation.metadata.messageIndex === undefined
}

interface UseAnnotationNavigationOptions {
  scrollContainerRef: React.RefObject<HTMLElement | null>
  onSwitchToConversation?: () => void
  /** Whether the conversation view is currently active/visible. When false, uses pending navigation. */
  isConversationActive?: boolean
}

export function useAnnotationNavigation({
  scrollContainerRef,
  onSwitchToConversation,
  isConversationActive = true,
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

  const scrollToElement = useCallback(
    (element: HTMLElement, clickTarget: HTMLElement | null, annotationId: string) => {
      const container = scrollContainerRef.current

      const afterScroll = () => {
        applyHighlight(element)

        if (clickTarget) {
          const popover = document.querySelector("[data-radix-popper-content-wrapper]")
          const cardInPopover = popover?.querySelector(`[data-annotation-card-id="${annotationId}"]`)

          if (cardInPopover) {
            highlightAnnotationInPopover(annotationId)
          } else {
            clickTarget.click()
            highlightAnnotationInPopover(annotationId)
          }
        }
      }

      if (container) {
        let handled = false
        const onScrollEnd = () => {
          if (handled) return
          handled = true
          container.removeEventListener("scrollend", onScrollEnd)
          afterScroll()
        }

        container.addEventListener("scrollend", onScrollEnd)
        element.scrollIntoView({ behavior: "smooth", block: "center" })

        // Fallback: scrollend won't fire if element is already in view
        setTimeout(onScrollEnd, 600)
      } else {
        element.scrollIntoView({ behavior: "instant", block: "center" })
        afterScroll()
      }
    },
    [scrollContainerRef, applyHighlight, highlightAnnotationInPopover],
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
          scrollToElement(textElement, textElement, annotation.id)
          return true
        }

        const observer = new MutationObserver((_, obs) => {
          const element = container.querySelector<HTMLElement>(`[data-annotation-id="${annotation.id}"]`)
          if (element) {
            obs.disconnect()
            observerRef.current = null
            scrollToElement(element, element, annotation.id)
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
          scrollToElement(messageElement, triggerElement, annotation.id)
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
