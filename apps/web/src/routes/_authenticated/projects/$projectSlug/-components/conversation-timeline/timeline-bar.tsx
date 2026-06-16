import { useState } from "react"
import type {
  ConversationTimeline,
  TimelineMarker,
} from "../../../../../../lib/conversation-timeline/build-conversation-timeline.ts"
import type { TrackBand } from "../../../../../../lib/conversation-timeline/message-windows.ts"
import { TimelineEventHoverCard } from "./timeline-event-card.tsx"
import { type MarkerHover, TimelineTrack } from "./timeline-track.tsx"

export function TimelineBar({
  timeline,
  band,
  hoverSlice,
  onTrackClick,
  onMarkerClick,
}: {
  readonly timeline: ConversationTimeline
  /** Time band of the messages currently on screen (the viewport indicator). */
  readonly band: TrackBand | null
  /** Time slice of the message hovered in the conversation, highlighted on the track. */
  readonly hoverSlice?: TrackBand | null | undefined
  readonly onTrackClick: (timelineMs: number) => void
  readonly onMarkerClick: (marker: TimelineMarker) => void
}) {
  const [markerHover, setMarkerHover] = useState<MarkerHover | null>(null)

  return (
    <div className="relative flex flex-col gap-1 border-t border-border bg-background px-4 py-3">
      {markerHover && <TimelineEventHoverCard markers={markerHover.markers} anchorRect={markerHover.anchorRect} />}
      <TimelineTrack
        timeline={timeline}
        band={band}
        hoverSlice={hoverSlice ?? null}
        onTrackClick={onTrackClick}
        onMarkerClick={onMarkerClick}
        onMarkerHover={setMarkerHover}
      />
    </div>
  )
}
