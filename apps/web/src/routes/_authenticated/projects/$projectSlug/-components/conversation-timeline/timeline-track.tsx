import { cn, Text } from "@repo/ui"
import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react"
import type { ActivityCategory } from "../../../../../../lib/conversation-timeline/build-activity-track.ts"
import type {
  ConversationTimeline,
  TimelineMarker,
} from "../../../../../../lib/conversation-timeline/build-conversation-timeline.ts"
import {
  clusterMarkers,
  MARKER_CLUSTER_THRESHOLD_PCT,
  type MarkerCluster,
} from "../../../../../../lib/conversation-timeline/cluster-markers.ts"
import type { TrackBand } from "../../../../../../lib/conversation-timeline/message-windows.ts"
import {
  segmentAt,
  timelineToPct,
  timelineToWall,
  wallToTimeline,
} from "../../../../../../lib/conversation-timeline/timeline-scale.ts"
import { DURATION_COLORS } from "../trace-detail-drawer/duration-composition.ts"
import { formatDuration } from "../trace-detail-drawer/tabs/spans-tab/span-tree/tree-utils.ts"
import { markerAriaLabel, markerChipIcon, markerIcon } from "./timeline-event-card.tsx"

const CLUSTER_CHIP_PX = 26
// Quantizing the measured lane width makes a drag-resize re-cluster only every
// step instead of every pixel (same-value setState bails out of the render).
const LANE_WIDTH_QUANTUM_PX = 24

export interface MarkerHover {
  readonly markers: readonly TimelineMarker[]
  readonly leftPct: number
}

const ACTIVITY_LABELS: Readonly<Record<ActivityCategory, string>> = {
  generation: "Generating",
  tool: "Running tools",
  retrieval: "Retrieving",
  other: "Working",
  idle: "Waiting",
}

function EventMarker({
  marker,
  leftPct,
  onClick,
  onHover,
}: {
  readonly marker: TimelineMarker
  readonly leftPct: number
  readonly onClick: () => void
  readonly onHover: (hover: MarkerHover | null) => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={() => onHover({ markers: [marker], leftPct })}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover({ markers: [marker], leftPct })}
      onBlur={() => onHover(null)}
      aria-label={markerAriaLabel(marker)}
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 transition-transform hover:scale-125"
      style={{ left: `${leftPct}%` }}
    >
      {markerIcon(marker)}
    </button>
  )
}

function MarkerClusterChip({
  cluster,
  onClick,
  onHover,
}: {
  readonly cluster: MarkerCluster
  readonly onClick: () => void
  readonly onHover: (hover: MarkerHover | null) => void
}) {
  const hover: MarkerHover = { markers: cluster.markers, leftPct: cluster.leftPct }
  const first = cluster.markers[0]
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={() => onHover(hover)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(hover)}
      onBlur={() => onHover(null)}
      aria-label={`${cluster.markers.length} events`}
      className="absolute top-1/2 flex h-4 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-0.5 rounded-full border border-border bg-background px-1 font-medium text-[10px] text-foreground transition-transform hover:scale-110"
      style={{ left: `${cluster.leftPct}%` }}
    >
      {first && markerChipIcon(first)}
      {cluster.markers.length}
    </button>
  )
}

export function TimelineTrack({
  timeline,
  band,
  onTrackClick,
  onMarkerClick,
  onMarkerHover,
}: {
  readonly timeline: ConversationTimeline
  /** Time band covered by the messages currently on screen; null dims nothing. */
  readonly band: TrackBand | null
  readonly onTrackClick: (timelineMs: number) => void
  readonly onMarkerClick: (marker: TimelineMarker) => void
  readonly onMarkerHover: (hover: MarkerHover | null) => void
}) {
  const { scale } = timeline
  const total = scale.totalTimelineMs
  const wallPct = (wallMs: number) => timelineToPct(scale, wallToTimeline(scale, wallMs))

  const laneRef = useRef<HTMLDivElement>(null)
  const [laneWidthPx, setLaneWidthPx] = useState<number | null>(null)

  // TODO(frontend-use-effect-policy): cluster density depends on the rendered
  // lane width, an external layout value only observable via ResizeObserver.
  useEffect(() => {
    const lane = laneRef.current
    if (!lane) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width !== undefined) setLaneWidthPx(Math.round(width / LANE_WIDTH_QUANTUM_PX) * LANE_WIDTH_QUANTUM_PX)
    })
    observer.observe(lane)
    return () => observer.disconnect()
  }, [])

  // Merge only what would actually overlap at the current width: one chip-width
  // of pixels, expressed as a track percentage.
  const clusterThresholdPct =
    laneWidthPx && laneWidthPx > 0 ? (CLUSTER_CHIP_PX / laneWidthPx) * 100 : MARKER_CLUSTER_THRESHOLD_PCT

  // Positions clamped to 1.5–98.5% keep edge markers fully inside the lane
  // instead of half-clipped at 0%/100%.
  const clusters = useMemo(
    () =>
      clusterMarkers(
        timeline.markers.map((marker) => ({
          marker,
          timelineMs: wallToTimeline(scale, marker.atMs),
          leftPct: Math.min(98.5, Math.max(1.5, timelineToPct(scale, wallToTimeline(scale, marker.atMs)))),
        })),
        clusterThresholdPct,
      ),
    [timeline.markers, scale, clusterThresholdPct],
  )

  const [hoverRatio, setHoverRatio] = useState<number | null>(null)
  const hoverTimelineMs = hoverRatio === null ? null : hoverRatio * total
  const hoverSegment = hoverTimelineMs === null ? null : segmentAt(scale, hoverTimelineMs)
  const hoverInGap = hoverSegment?.kind === "gap"
  // Wall time inside a compressed gap is interpolated and misleading — omit it there.
  const hoverTimeLabel =
    hoverTimelineMs === null || hoverInGap
      ? null
      : new Date(timelineToWall(scale, hoverTimelineMs)).toLocaleTimeString()
  const hoverActivity =
    hoverTimelineMs === null || hoverInGap
      ? null
      : (timeline.activity.find((s) => hoverTimelineMs >= s.timelineStartMs && hoverTimelineMs < s.timelineEndMs) ??
        null)
  const hoverActionLabel = hoverInGap
    ? hoverSegment.gapLabel
      ? `Idle · ${hoverSegment.gapLabel}`
      : "Idle"
    : hoverActivity
      ? `${ACTIVITY_LABELS[hoverActivity.category]} · ${formatDuration(hoverActivity.durationMs)}`
      : null

  const pointerRatio = (e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return null
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  }

  if (total <= 0) return null

  return (
    <div className="flex flex-col">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only hit target; keyboard users reach events via the marker buttons and messages via N/P */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: same — clicking the track is a pointer shortcut to the message at that time */}
      <div
        className="group relative cursor-pointer rounded-sm py-1"
        onClick={(e) => {
          const ratio = pointerRatio(e)
          if (ratio !== null) onTrackClick(ratio * total)
        }}
        onPointerMove={(e) => setHoverRatio(pointerRatio(e))}
        onPointerLeave={() => setHoverRatio(null)}
      >
        <div className="relative h-4 w-full overflow-hidden rounded-sm">
          {timeline.activity.map((segment) => (
            <div
              key={segment.timelineStartMs}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 transition-[height] duration-100",
                hoverActivity?.timelineStartMs === segment.timelineStartMs ? "h-full" : "h-3",
              )}
              style={{
                left: `${timelineToPct(scale, segment.timelineStartMs)}%`,
                width: `${((segment.timelineEndMs - segment.timelineStartMs) / total) * 100}%`,
                ...(segment.category === "idle"
                  ? {
                      backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 2px, ${DURATION_COLORS.idle} 2px, ${DURATION_COLORS.idle} 3px)`,
                    }
                  : { backgroundColor: DURATION_COLORS[segment.category] }),
              }}
            />
          ))}

          {scale.segments.map((segment) => {
            if (segment.kind !== "gap") return null
            return (
              <div
                key={segment.timelineStartMs}
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 border-x border-background bg-background transition-[height] duration-100",
                  hoverInGap && hoverSegment.timelineStartMs === segment.timelineStartMs ? "h-full" : "h-3",
                )}
                style={{
                  left: `${timelineToPct(scale, segment.timelineStartMs)}%`,
                  width: `${((segment.timelineEndMs - segment.timelineStartMs) / total) * 100}%`,
                  backgroundImage:
                    "repeating-linear-gradient(45deg, transparent, transparent 2px, var(--border) 2px, var(--border) 3px)",
                }}
              />
            )
          })}

          {band && (
            <>
              <div
                className="pointer-events-none absolute top-0 left-0 h-full bg-background/70"
                style={{ width: `${band.startPct}%` }}
              />
              <div
                className="pointer-events-none absolute top-0 right-0 h-full bg-background/70"
                style={{ width: `${100 - band.endPct}%` }}
              />
            </>
          )}
        </div>

        {timeline.markers.map((marker) => {
          if (marker.kind !== "trace" || marker.traceIndex === 0) return null
          return (
            <div
              key={marker.traceId}
              className="pointer-events-none absolute top-1 h-[calc(100%-0.5rem)] w-0.5 -translate-x-1/2 bg-foreground/50"
              style={{ left: `${wallPct(marker.atMs)}%` }}
            />
          )
        })}

        {hoverTimelineMs !== null && (hoverTimeLabel !== null || hoverActionLabel !== null) && (
          <>
            <div
              className="pointer-events-none absolute top-0 h-full -translate-x-1/2"
              style={{ left: `${timelineToPct(scale, hoverTimelineMs)}%` }}
            >
              <div className="h-full w-px bg-foreground/40" />
            </div>
            <div
              className="pointer-events-none absolute bottom-[calc(100%+0.25rem)] z-10 flex -translate-x-1/2 flex-col items-center rounded bg-foreground/80 px-1.5 py-0.5"
              style={{ left: `${Math.min(96, Math.max(4, timelineToPct(scale, hoverTimelineMs)))}%` }}
            >
              {hoverTimeLabel && (
                <Text.H6 color="background" noWrap>
                  {hoverTimeLabel}
                </Text.H6>
              )}
              {hoverActionLabel && (
                <div className="opacity-80">
                  <Text.H6 color="background" noWrap>
                    {hoverActionLabel}
                  </Text.H6>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div ref={laneRef} className="relative h-6">
        {clusters.map((cluster, index) => {
          const single = cluster.markers.length === 1 ? cluster.markers[0] : undefined
          return single ? (
            <EventMarker
              key={`marker-${index}`}
              marker={single}
              leftPct={cluster.leftPct}
              onClick={() => onMarkerClick(single)}
              onHover={onMarkerHover}
            />
          ) : (
            <MarkerClusterChip
              key={`cluster-${index}`}
              cluster={cluster}
              onClick={() => {
                const first = cluster.markers[0]
                if (first) onMarkerClick(first)
              }}
              onHover={onMarkerHover}
            />
          )
        })}
      </div>
    </div>
  )
}
