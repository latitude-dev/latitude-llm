import { SEVERITY_COLOR } from "@domain/shared"
import { Popover, PopoverAnchor, PopoverContent, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { ChevronRightIcon } from "lucide-react"
import { useRef } from "react"
import type { AlertIncidentRecord } from "./alerts.functions.ts"
import { formatIncidentKindLabel, SEVERITY_LABELS } from "./incident-markers.ts"

/**
 * Popover anchored at a chart-bucket point, listing every incident touching that bucket. Signal
 * rows link to the issue page (`/signals/<id>`); saved-search rows link to their monitor
 * (`?monitorSlug=…`). The popover is consumer-owned — the chart surfaces the bucket anchor; this
 * component renders the list and the navigation links.
 */
interface IncidentMarkerPopoverProps {
  readonly open: boolean
  readonly anchor: { readonly clientX: number; readonly clientY: number } | null
  readonly incidents: readonly AlertIncidentRecord[]
  readonly projectSlug: string
  readonly onOpenChange: (open: boolean) => void
  /**
   * Optional hover-card grace handlers — wired to the popover content so a consumer can
   * cancel a pending hover-out close when the cursor enters the popover, and re-schedule
   * one when it leaves. Lets the user move from the marker into the popover to click a link
   * without it yanking shut.
   */
  readonly onContentMouseEnter?: () => void
  readonly onContentMouseLeave?: () => void
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function formatTiming(incident: AlertIncidentRecord): string {
  if (incident.endedAt === null) return `${formatTimeShort(incident.startedAt)} → ongoing`
  if (incident.endedAt !== incident.startedAt) {
    return `${formatTimeShort(incident.startedAt)} → ${formatTimeShort(incident.endedAt)}`
  }
  return formatTimeShort(incident.startedAt)
}

const ROW_CLASS = "flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent focus-visible:bg-accent outline-none"

/**
 * One incident row. Signal incidents link to the issue page; saved-search incidents link to their
 * monitor (and fall back to a non-interactive row when the monitor alert was deleted). The primary
 * label is the issue name for issues and the saved search name for saved searches, followed (saved
 * search only) by the humanised condition and the "Created by monitor X" attribution.
 */
function IncidentRow({
  incident,
  projectSlug,
  onNavigate,
}: {
  readonly incident: AlertIncidentRecord
  readonly projectSlug: string
  readonly onNavigate: () => void
}) {
  // Signals link to the issue; everything else with a monitor (saved-search AND
  // unified target-on-monitor incidents) links to that monitor's page.
  const isSignal = incident.sourceType === "issue"
  const signalTarget = isSignal && incident.sourceId !== null ? incident.sourceId : null
  const monitorTarget = !isSignal && incident.monitorSlug !== null ? incident.monitorSlug : null
  const primaryLabel = isSignal ? incident.signalName : incident.savedSearchName
  const navigable = signalTarget !== null || monitorTarget !== null

  const body = (
    <>
      <span
        aria-hidden
        className="mt-1 inline-block size-2 shrink-0 rounded-full"
        style={{ background: SEVERITY_COLOR[incident.severity] }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Text.H6M color="foreground">{formatIncidentKindLabel(incident.kind)}</Text.H6M>
          <Text.H6 color="foregroundMuted">·</Text.H6>
          <Text.H6 color="foregroundMuted">{SEVERITY_LABELS[incident.severity]}</Text.H6>
        </div>
        <div className="flex min-w-0 flex-col">
          {primaryLabel ? (
            <Text.H6 color="foreground" className="min-w-0 truncate">
              {primaryLabel}
            </Text.H6>
          ) : null}
          {!isSignal && incident.conditionSummary ? (
            <Text.H6 color="foregroundMuted" className="min-w-0 truncate">
              {incident.conditionSummary}
            </Text.H6>
          ) : null}
          {!isSignal && incident.monitorName ? (
            <Text.H6 color="foregroundMuted" className="min-w-0 truncate">
              Created by monitor <b>{incident.monitorName}</b>
            </Text.H6>
          ) : null}
          <Text.H6 color="foregroundMuted" noWrap>
            {formatTiming(incident)}
          </Text.H6>
        </div>
      </div>
      {navigable ? <ChevronRightIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
    </>
  )

  if (signalTarget !== null) {
    return (
      <Link
        to="/projects/$projectSlug/signals/$signalId"
        params={{ projectSlug, signalId: signalTarget }}
        onClick={onNavigate}
        className={ROW_CLASS}
      >
        {body}
      </Link>
    )
  }

  if (monitorTarget !== null) {
    return (
      <Link
        to="/projects/$projectSlug/monitors/$monitorSlug"
        params={{ projectSlug, monitorSlug: monitorTarget }}
        onClick={onNavigate}
        className={ROW_CLASS}
      >
        {body}
      </Link>
    )
  }

  return <div className="flex items-start gap-2 px-2 py-1.5">{body}</div>
}

export function IncidentMarkerPopover({
  open,
  anchor,
  incidents,
  projectSlug,
  onOpenChange,
  onContentMouseEnter,
  onContentMouseLeave,
}: IncidentMarkerPopoverProps) {
  // Hold onto the last anchor so the closing animation doesn't jump while `anchor` resets to null.
  const lastAnchorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  if (anchor) {
    lastAnchorRef.current = { x: anchor.clientX, y: anchor.clientY }
  }
  const point = anchor ? { x: anchor.clientX, y: anchor.clientY } : lastAnchorRef.current

  // Virtual ref for Radix: getBoundingClientRect returns a 0×0 rect at the cursor coords so the
  // popover positions itself there with no DOM node required.
  const virtualRef = useRef<{ getBoundingClientRect: () => DOMRect }>({
    getBoundingClientRect: () => DOMRect.fromRect({ width: 0, height: 0, x: point.x, y: point.y }),
  })
  virtualRef.current = {
    getBoundingClientRect: () => DOMRect.fromRect({ width: 0, height: 0, x: point.x, y: point.y }),
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        align="center"
        side="bottom"
        sideOffset={8}
        className="w-80 max-h-80 overflow-y-auto p-1"
        onMouseEnter={onContentMouseEnter}
        onMouseLeave={onContentMouseLeave}
        // Radix moves focus into the content on open and back to the trigger on close by
        // default — fine for click-opened popovers, disruptive for a hover-opened one (it can
        // pull focus out of an input the user is typing into). Preventing both keeps the
        // keyboard focus where the user left it.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="px-2 py-1.5">
          <Text.H6B color="foreground">
            {incidents.length === 1 ? "Incident" : `${incidents.length} incidents`}
          </Text.H6B>
        </div>
        <ul className="flex flex-col">
          {incidents.map((incident) => (
            <li key={incident.id}>
              <IncidentRow incident={incident} projectSlug={projectSlug} onNavigate={() => onOpenChange(false)} />
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
