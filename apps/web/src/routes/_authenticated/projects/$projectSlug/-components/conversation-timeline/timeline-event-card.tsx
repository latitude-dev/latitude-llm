import { cn, LatitudeLogo, Text } from "@repo/ui"
import { MessageSquareIcon, TagsIcon, ThumbsDownIcon, ThumbsUpIcon, UserIcon, WrenchIcon } from "lucide-react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import type { TimelineMarker } from "../../../../../../lib/conversation-timeline/build-conversation-timeline.ts"
import { formatDuration } from "../trace-detail-drawer/tabs/spans-tab/span-tree/tree-utils.ts"

const CARD_MAX_EVENTS = 2
const CARD_WIDTH_PX = 240
const VIEWPORT_PADDING_PX = 8

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

export function markerAriaLabel(marker: TimelineMarker): string {
  switch (marker.kind) {
    case "trace":
      return `Turn ${marker.traceIndex + 1}: ${marker.userExcerpt ?? marker.label}`
    case "annotation": {
      const status = marker.flaggerSlug
        ? `Flagged: ${capitalize(marker.flaggerSlug.replaceAll("-", " "))}`
        : marker.passed === null
          ? "Annotation"
          : marker.passed
            ? "Passed annotation"
            : "Failed annotation"
      return marker.feedback ? `${status}: ${marker.feedback}` : status
    }
    case "toolCall":
      return `${marker.label} failed · ${formatDuration(marker.durationMs)}`
    case "moment":
      return marker.summary ? `${marker.label} — ${marker.summary}` : marker.label
  }
}

export function markerIcon(marker: TimelineMarker): ReactNode {
  switch (marker.kind) {
    case "trace":
      return (
        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background">
          <UserIcon className="h-2.5 w-2.5 text-foreground" />
        </span>
      )
    case "annotation":
      if (marker.flaggerSlug) return <LatitudeLogo className="h-3.5 w-3.5" />
      return (
        <MessageSquareIcon
          className={cn("h-3.5 w-3.5", marker.passed === false ? "text-destructive" : "text-primary")}
        />
      )
    case "toolCall":
      return <WrenchIcon className="h-3.5 w-3.5 text-destructive" />
    case "moment":
      return <TagsIcon className="h-3.5 w-3.5 text-violet-500" />
  }
}

/** Compact icon for cluster chips — same kind colors, no circled-trace chrome. */
export function markerChipIcon(marker: TimelineMarker): ReactNode {
  switch (marker.kind) {
    case "trace":
      return <UserIcon className="h-3 w-3 text-foreground" />
    case "annotation":
      if (marker.flaggerSlug) return <LatitudeLogo className="h-3 w-3" />
      return (
        <MessageSquareIcon className={cn("h-3 w-3", marker.passed === false ? "text-destructive" : "text-primary")} />
      )
    case "toolCall":
      return <WrenchIcon className="h-3 w-3 text-destructive" />
    case "moment":
      return <TagsIcon className="h-3 w-3 text-violet-500" />
  }
}

function eventHeader(marker: TimelineMarker): {
  readonly label: string
  readonly colorClass: string
  readonly icon: ReactNode
} {
  switch (marker.kind) {
    case "trace":
      return { label: "User turn", colorClass: "text-muted-foreground", icon: <UserIcon className="h-3.5 w-3.5" /> }
    case "toolCall":
      return { label: "Tool failed", colorClass: "text-destructive", icon: <WrenchIcon className="h-3.5 w-3.5" /> }
    case "moment":
      return { label: "Moment", colorClass: "text-violet-500", icon: <TagsIcon className="h-3.5 w-3.5" /> }
    case "annotation":
      if (marker.flaggerSlug)
        return {
          label: "Flagged",
          colorClass: "text-accent-foreground",
          icon: <LatitudeLogo className="h-3.5 w-3.5" />,
        }
      return marker.passed === null
        ? {
            label: "Annotation",
            colorClass: "text-muted-foreground",
            icon: <MessageSquareIcon className="h-3.5 w-3.5" />,
          }
        : marker.passed
          ? {
              label: "Annotation",
              colorClass: "text-success-muted-foreground",
              icon: <ThumbsUpIcon className="h-3.5 w-3.5" />,
            }
          : {
              label: "Annotation",
              colorClass: "text-destructive",
              icon: <ThumbsDownIcon className="h-3.5 w-3.5" />,
            }
  }
}

function eventFooterMeta(marker: TimelineMarker): readonly string[] {
  switch (marker.kind) {
    case "trace":
      return [`Turn ${marker.traceIndex + 1}`, ...(marker.userExcerpt ? [marker.label] : [])]
    case "toolCall":
      return [`took ${formatDuration(marker.durationMs)}`]
    case "annotation":
      return !marker.flaggerSlug && marker.annotatorName ? [`by ${marker.annotatorName}`] : []
    case "moment":
      return marker.confidence !== null ? [`${Math.round(marker.confidence * 100)}% confidence`] : []
  }
}

function EventDetails({ marker }: { readonly marker: TimelineMarker }) {
  switch (marker.kind) {
    case "trace":
      return marker.userExcerpt ? (
        <Text.H6 lineClamp={2}>{marker.userExcerpt}</Text.H6>
      ) : (
        <Text.H6 lineClamp={2}>{marker.label}</Text.H6>
      )
    case "toolCall":
      return (
        <>
          <Text.Mono size="h6" ellipsis>
            {marker.label}
          </Text.Mono>
          {marker.errorExcerpt && (
            <div className="line-clamp-3 rounded-md bg-muted px-2 py-1.5">
              <Text.Mono size="h7" color="foregroundMuted" whiteSpace="normal">
                {marker.errorExcerpt}
              </Text.Mono>
            </div>
          )}
        </>
      )
    case "annotation":
      return (
        <>
          {marker.flaggerSlug ? (
            <Text.H6>{capitalize(marker.flaggerSlug.replaceAll("-", " "))}</Text.H6>
          ) : marker.passed !== null ? (
            <Text.H6>{marker.passed ? "Passed" : "Failed"}</Text.H6>
          ) : null}
          {marker.feedback && (
            <Text.H6 color="foregroundMuted" lineClamp={4}>
              {marker.feedback}
            </Text.H6>
          )}
        </>
      )
    case "moment":
      return (
        <>
          <Text.H6>{marker.label}</Text.H6>
          {marker.summary && (
            <Text.H6 color="foregroundMuted" lineClamp={4}>
              {marker.summary}
            </Text.H6>
          )}
        </>
      )
  }
}

/**
 * Structured event rendering for the marker hover card. Header = colored icon
 * + event type; footer = wall-clock time plus kind-specific meta, closest to
 * the timeline.
 */
export function TimelineEventCardContent({ marker }: { readonly marker: TimelineMarker }) {
  const header = eventHeader(marker)
  const meta = [new Date(marker.atMs).toLocaleTimeString(), ...eventFooterMeta(marker)]
  return (
    <div className="flex w-60 flex-col gap-1.5">
      <div className={cn("flex items-center gap-1.5 uppercase tracking-wide", header.colorClass)}>
        <span className="shrink-0">{header.icon}</span>
        <Text.H7 color="inherit">{header.label}</Text.H7>
      </div>
      <EventDetails marker={marker} />
      <Text.H7 color="foregroundMuted" noWrap ellipsis>
        {meta.join(" · ")}
      </Text.H7>
    </div>
  )
}

function TimelineBarCard({ anchorRect, children }: { readonly anchorRect: DOMRect; readonly children: ReactNode }) {
  if (typeof document === "undefined") return null

  const halfWidth = CARD_WIDTH_PX / 2
  const minLeft = VIEWPORT_PADDING_PX + halfWidth
  const maxLeft = window.innerWidth - VIEWPORT_PADDING_PX - halfWidth
  const left = Math.min(maxLeft, Math.max(minLeft, anchorRect.left + anchorRect.width / 2))
  const top = anchorRect.top - VIEWPORT_PADDING_PX

  return createPortal(
    <div
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full"
      style={{ left: `${left}px`, top: `${top}px` }}
    >
      {children}
    </div>,
    document.body,
  )
}

export function TimelineEventHoverCard({
  markers,
  anchorRect,
}: {
  readonly markers: readonly TimelineMarker[]
  readonly anchorRect: DOMRect
}) {
  const visibleMarkers = markers.slice(0, CARD_MAX_EVENTS)
  const hiddenCount = markers.length - visibleMarkers.length
  return (
    <TimelineBarCard anchorRect={anchorRect}>
      <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-md">
        <div className="flex flex-col divide-y divide-border">
          {visibleMarkers.map((marker, index) => (
            <div key={index} className="p-3">
              <TimelineEventCardContent marker={marker} />
            </div>
          ))}
        </div>
        {hiddenCount > 0 && (
          <div className="px-3 pb-2">
            <Text.H6 color="foregroundMuted">+{hiddenCount} more events</Text.H6>
          </div>
        )}
      </div>
    </TimelineBarCard>
  )
}
