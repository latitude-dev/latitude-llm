import { useEffect, useRef } from "react"
import { useAnnotationsByTrace } from "../../../../../../../domains/annotations/annotations.collection.ts"
import { useTraceDetail } from "../../../../../../../domains/traces/traces.collection.ts"
import { useAnnotationNavigation } from "./use-annotation-navigation.ts"
import type { TextSelectionPopoverControls } from "./use-annotation-popover.ts"

/**
 * Conversation annotation focus + scroll/flash/open wiring, shared by the trace
 * drawer body and the session panel's Conversation tab (both render the same
 * `<ConversationTab>`). Owns the scroll container + text-selection popover refs
 * and the navigation hook, and drives:
 *
 * - `focusAnnotationId`: when navigation requests an annotation (e.g. clicking an
 *   inline annotation in the session Annotations tab), scroll to it and open its
 *   popover. We only fire once the conversation is *active* (so its scroll
 *   container is mounted) AND its messages have *loaded* — otherwise the scroll
 *   target doesn't exist yet and the navigation hook would no-op without retrying.
 *   The hook itself observes the DOM for any remaining render lag.
 * - draining a pending scroll queued while the conversation tab was inactive.
 */
export function useConversationAnnotationFocus({
  projectId,
  traceId,
  focusAnnotationId,
  isConversationActive,
  onActivateConversation,
  onFocusConsumed,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly focusAnnotationId?: string | undefined
  readonly isConversationActive: boolean
  readonly onActivateConversation?: (() => void) | undefined
  readonly onFocusConsumed?: (() => void) | undefined
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textSelectionPopoverControlsRef = useRef<TextSelectionPopoverControls | null>(null)

  const { data: annotationsData } = useAnnotationsByTrace({ projectId, traceId, draftMode: "include" })
  const { data: traceDetail, isLoading: isDetailLoading } = useTraceDetail({ projectId, traceId })

  const { scrollToAnnotation, executePendingScroll } = useAnnotationNavigation({
    scrollContainerRef,
    ...(onActivateConversation ? { onSwitchToConversation: onActivateConversation } : {}),
    isConversationActive,
    textSelectionPopoverControlsRef,
  })

  useEffect(() => {
    if (isConversationActive) executePendingScroll()
  }, [isConversationActive, executePendingScroll])

  const focusHandledRef = useRef<string | null>(null)
  useEffect(() => {
    // Cleared request → reset the guard so the next one (even the same id) fires.
    if (!focusAnnotationId) {
      focusHandledRef.current = null
      return
    }
    if (focusHandledRef.current === focusAnnotationId) return
    if (!isConversationActive || isDetailLoading || !traceDetail) return
    const annotation = annotationsData?.items?.find((item) => item.id === focusAnnotationId)
    if (!annotation) return
    focusHandledRef.current = focusAnnotationId
    scrollToAnnotation(annotation)
    onFocusConsumed?.()
  }, [
    focusAnnotationId,
    isConversationActive,
    isDetailLoading,
    traceDetail,
    annotationsData,
    scrollToAnnotation,
    onFocusConsumed,
  ])

  return {
    scrollContainerRef,
    textSelectionPopoverControlsRef,
    scrollToAnnotation,
    traceDetail,
    isDetailLoading,
  }
}
