import { useMountEffect } from "@repo/ui"
import { useCallback, useRef, useState } from "react"
import type { AlertIncidentRecord } from "./alerts.functions.ts"

const DEFAULT_CLOSE_GRACE_MS = 200

interface UseIncidentBucketHoverPopoverInput {
  /** Map of bucket index → incidents that touch that bucket. */
  readonly incidentsTouchingBucketIndex: ReadonlyMap<number, readonly AlertIncidentRecord[]>
  /** Grace period (ms) between leaving the bucket/popover and the popover actually closing. */
  readonly closeGraceMs?: number
}

interface UseIncidentBucketHoverPopoverReturn {
  readonly popover: {
    readonly bucketIndex: number
    readonly anchor: { readonly clientX: number; readonly clientY: number }
  } | null
  readonly popoverIncidents: readonly AlertIncidentRecord[]
  /** Wire to `BarChart`'s `onBucketAxisPointerChange`. */
  readonly handleBucketAxisPointerChange: (
    dataIndex: number | null,
    anchor: { clientX: number; clientY: number } | null,
  ) => void
  /** Wire to `IncidentMarkerPopover`'s `onOpenChange`. */
  readonly onOpenChange: (open: boolean) => void
  /** Wire to `IncidentMarkerPopover`'s `onContentMouseEnter`. */
  readonly onContentMouseEnter: () => void
  /** Wire to `IncidentMarkerPopover`'s `onContentMouseLeave`. */
  readonly onContentMouseLeave: () => void
}

/**
 * Hover-card state machine for the incident bucket popover. Opens when the chart's axis
 * pointer enters a bucket with incidents; closes after a grace period when the cursor leaves
 * the bucket and the popover content. The grace lets the cursor transit from the bar down
 * into the popover to click a link.
 *
 * Shared by the issues analytics panel and the project traces overview histogram so timer
 * tuning, cleanup, and reset-on-refetch stay consistent across both surfaces.
 */
export function useIncidentBucketHoverPopover({
  incidentsTouchingBucketIndex,
  closeGraceMs = DEFAULT_CLOSE_GRACE_MS,
}: UseIncidentBucketHoverPopoverInput): UseIncidentBucketHoverPopoverReturn {
  const [popover, setPopover] = useState<{
    bucketIndex: number
    anchor: { clientX: number; clientY: number }
  } | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelPendingClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    cancelPendingClose()
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      setPopover(null)
    }, closeGraceMs)
  }, [cancelPendingClose, closeGraceMs])

  // Clear the pending close timer on unmount. Mount-only effect — there's nothing to react to.
  useMountEffect(() => () => cancelPendingClose())

  const handleBucketAxisPointerChange = useCallback(
    (dataIndex: number | null, anchor: { clientX: number; clientY: number } | null) => {
      if (dataIndex === null || anchor === null || !incidentsTouchingBucketIndex.has(dataIndex)) {
        scheduleClose()
        return
      }
      cancelPendingClose()
      setPopover({ bucketIndex: dataIndex, anchor })
    },
    [cancelPendingClose, scheduleClose, incidentsTouchingBucketIndex],
  )

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        cancelPendingClose()
        setPopover(null)
      }
    },
    [cancelPendingClose],
  )

  // Derive the visible popover during render: when the bucket the popover state captured no
  // longer touches any incidents (data refetch / filter change), `popoverIncidents` collapses
  // to `[]` and we expose the popover as null so the consumer treats it as closed. No effect
  // needed — the next hover transition or close-timer fire will clear the internal state.
  const popoverIncidents = popover ? (incidentsTouchingBucketIndex.get(popover.bucketIndex) ?? []) : []
  const visiblePopover = popoverIncidents.length === 0 ? null : popover

  return {
    popover: visiblePopover,
    popoverIncidents,
    handleBucketAxisPointerChange,
    onOpenChange,
    onContentMouseEnter: cancelPendingClose,
    onContentMouseLeave: scheduleClose,
  }
}
