interface TimelineWindow {
  readonly startMs: number
  readonly endMs: number
}

export interface TimelineSegment {
  readonly kind: "active" | "gap"
  readonly wallStartMs: number
  readonly wallEndMs: number
  readonly timelineStartMs: number
  readonly timelineEndMs: number
  readonly gapLabel: string | null
}

export interface TimelineScale {
  readonly segments: readonly TimelineSegment[]
  readonly totalTimelineMs: number
  readonly wallStartMs: number
  readonly wallEndMs: number
}

export const GAP_TIMELINE_MS = 1_500
const MIN_COMPRESSIBLE_GAP_MS = 5_000

export function formatGapLabel(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `+${totalSeconds}s`
  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) {
    const seconds = totalSeconds % 60
    return seconds > 0 ? `+${totalMinutes}m ${seconds}s` : `+${totalMinutes}m`
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `+${hours}h ${minutes}m` : `+${hours}h`
}

function mergeWindows(windows: readonly TimelineWindow[]): TimelineWindow[] {
  const sorted = windows
    .filter((w) => w.endMs > w.startMs)
    .map((w) => ({ startMs: w.startMs, endMs: w.endMs }))
    .sort((a, b) => a.startMs - b.startMs)

  const merged: { startMs: number; endMs: number }[] = []
  for (const window of sorted) {
    const last = merged[merged.length - 1]
    if (last && window.startMs - last.endMs < MIN_COMPRESSIBLE_GAP_MS) {
      last.endMs = Math.max(last.endMs, window.endMs)
    } else {
      merged.push(window)
    }
  }
  return merged
}

/**
 * Maps wall-clock time onto a compressed timeline domain: active windows keep
 * their real duration, while idle gaps between them collapse to a constant
 * GAP_TIMELINE_MS so the track gives idle stretches a small constant width.
 */
export function buildTimelineScale(windows: readonly TimelineWindow[]): TimelineScale {
  const merged = mergeWindows(windows)
  const first = merged[0]
  if (!first) {
    return { segments: [], totalTimelineMs: 0, wallStartMs: 0, wallEndMs: 0 }
  }

  const segments: TimelineSegment[] = []
  let timelineCursor = 0
  let previousEnd = first.startMs

  for (const window of merged) {
    if (window.startMs > previousEnd) {
      segments.push({
        kind: "gap",
        wallStartMs: previousEnd,
        wallEndMs: window.startMs,
        timelineStartMs: timelineCursor,
        timelineEndMs: timelineCursor + GAP_TIMELINE_MS,
        gapLabel: formatGapLabel(window.startMs - previousEnd),
      })
      timelineCursor += GAP_TIMELINE_MS
    }
    const duration = window.endMs - window.startMs
    segments.push({
      kind: "active",
      wallStartMs: window.startMs,
      wallEndMs: window.endMs,
      timelineStartMs: timelineCursor,
      timelineEndMs: timelineCursor + duration,
      gapLabel: null,
    })
    timelineCursor += duration
    previousEnd = window.endMs
  }

  return {
    segments,
    totalTimelineMs: timelineCursor,
    wallStartMs: first.startMs,
    wallEndMs: previousEnd,
  }
}

export function wallToTimeline(scale: TimelineScale, wallMs: number): number {
  const segments = scale.segments
  const first = segments[0]
  const last = segments[segments.length - 1]
  if (!first || !last) return 0
  if (wallMs <= first.wallStartMs) return 0
  if (wallMs >= last.wallEndMs) return scale.totalTimelineMs

  for (const segment of segments) {
    if (wallMs > segment.wallEndMs) continue
    const wallSpan = segment.wallEndMs - segment.wallStartMs
    const timelineSpan = segment.timelineEndMs - segment.timelineStartMs
    if (wallSpan === 0) return segment.timelineStartMs
    return segment.timelineStartMs + ((wallMs - segment.wallStartMs) / wallSpan) * timelineSpan
  }
  return scale.totalTimelineMs
}

export function timelineToWall(scale: TimelineScale, timelineMs: number): number {
  const segments = scale.segments
  const first = segments[0]
  const last = segments[segments.length - 1]
  if (!first || !last) return 0
  if (timelineMs <= 0) return first.wallStartMs
  if (timelineMs >= scale.totalTimelineMs) return last.wallEndMs

  for (const segment of segments) {
    if (timelineMs > segment.timelineEndMs) continue
    const wallSpan = segment.wallEndMs - segment.wallStartMs
    const timelineSpan = segment.timelineEndMs - segment.timelineStartMs
    if (timelineSpan === 0) return segment.wallStartMs
    return segment.wallStartMs + ((timelineMs - segment.timelineStartMs) / timelineSpan) * wallSpan
  }
  return last.wallEndMs
}

export function timelineToPct(scale: TimelineScale, timelineMs: number): number {
  if (scale.totalTimelineMs === 0) return 0
  return Math.min(100, Math.max(0, (timelineMs / scale.totalTimelineMs) * 100))
}

export function segmentAt(scale: TimelineScale, timelineMs: number): TimelineSegment | null {
  for (const segment of scale.segments) {
    if (timelineMs >= segment.timelineStartMs && timelineMs < segment.timelineEndMs) return segment
  }
  return scale.segments[scale.segments.length - 1] ?? null
}
