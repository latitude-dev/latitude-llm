import { type ConversationTimeline, scheduleCompletionMs, scheduleStartMs } from "./build-conversation-timeline.ts"
import { segmentAt, timelineToPct, timelineToWall, wallToTimeline } from "./timeline-scale.ts"

export interface TrackBand {
  readonly startPct: number
  readonly endPct: number
}

type MessageWindows = Pick<ConversationTimeline, "schedules" | "scale">

/**
 * Message a track position lands on: the last message whose window starts at
 * or before the position's wall time. Inside a compressed gap, the first
 * message of the next trace. Null when there is nothing to resolve.
 */
export function messageIndexAtTime(timeline: MessageWindows, timelineMs: number): number | null {
  const { schedules, scale } = timeline
  if (schedules.length === 0 || scale.totalTimelineMs <= 0) return null

  const segment = segmentAt(scale, timelineMs)
  if (segment?.kind === "gap") {
    for (let i = 0; i < schedules.length; i++) {
      const schedule = schedules[i]
      if (schedule && scheduleStartMs(schedule) >= segment.wallEndMs) return i
    }
    return schedules.length - 1
  }

  const wallMs = timelineToWall(scale, timelineMs)
  let index = 0
  for (let i = 0; i < schedules.length; i++) {
    const schedule = schedules[i]
    if (schedule && scheduleStartMs(schedule) <= wallMs) index = i
  }
  return index
}

/** Track band (percent) covering the time windows of messages [first..last]. */
export function visibleRangeToBand(
  timeline: MessageWindows,
  firstMessageIndex: number,
  lastMessageIndex: number,
): TrackBand | null {
  const { schedules, scale } = timeline
  if (scale.totalTimelineMs <= 0) return null
  const first = schedules[firstMessageIndex]
  const last = schedules[lastMessageIndex]
  if (!first || !last) return null

  const endPct = timelineToPct(scale, wallToTimeline(scale, scheduleCompletionMs(last)))
  const startPct = Math.min(timelineToPct(scale, wallToTimeline(scale, scheduleStartMs(first))), endPct)
  return { startPct, endPct }
}
