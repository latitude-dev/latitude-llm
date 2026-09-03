import type { AlertSeverity } from "@domain/incidents"
import { INCIDENT_NOTIFICATION_KEY_LABEL, type IncidentNotificationKey, SEVERITY_COLOR } from "@domain/shared"
import type { BarChartOverlay, BarChartOverlayArea, BarChartOverlayLine } from "@repo/ui"
import type { AlertIncidentRecord } from "./alerts.functions.ts"

type TopSymbol = NonNullable<BarChartOverlayLine["topSymbol"]>

// Markers are paint-only — interactivity lives at the bucket level via the histogram's hover
// popover, not on the marker itself. Sizes are picked so each kind reads distinctly at a
// glance against a busy bar chart background.
const KIND_TOP_SYMBOL: Record<IncidentNotificationKey, TopSymbol> = {
  "monitor.match": { shape: "triangle", size: 9 },
  "monitor.threshold": { shape: "diamond", size: 10 },
  "monitor.escalating": { shape: "rect", size: 7 },
  "signal.escalating": { shape: "rect", size: 7 },
}

export const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
}

/**
 * Whether an incident should render as a time range (area) vs a single point (line):
 *
 * - `endedAt === null`  → open lifecycle incident, range extending to `now`.
 * - `endedAt > startedAt` → closed lifecycle incident, range from start to end.
 * - `endedAt === startedAt` → point-in-time event (eventful kinds), render only the start line.
 *
 * Decoupled from `kind` so adding a new eventful or lifecycle kind doesn't require touching the
 * rendering layer.
 */
function isRangedIncident(incident: AlertIncidentRecord): boolean {
  if (incident.endedAt === null) return true
  const startMs = Date.parse(incident.startedAt)
  const endMs = Date.parse(incident.endedAt)
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
}

/**
 * Snaps a moment to the **index** of the bucket whose half-open `[start, start + width)` range
 * contains it, clamped into `[0, lastIndex]`. Callers decide what is visible by testing the
 * incident's whole extent against the chart range, so a monitor incident backdated to the start
 * of a long run still paints from the left edge instead of vanishing.
 */
function snapMsToBucketIndex(
  ms: number,
  firstBucketStartMs: number,
  bucketWidthMs: number,
  lastIndex: number,
): number | null {
  if (!Number.isFinite(ms) || bucketWidthMs <= 0) return null
  const idx = Math.floor((ms - firstBucketStartMs) / bucketWidthMs)
  return Math.min(lastIndex, Math.max(0, idx))
}

/**
 * Which moment places an incident on a chart. `start` follows the offending run's `startedAt`,
 * which lines up with start-anchored bars (the sessions histogram). `raised` follows `createdAt`,
 * which lines up with activity-anchored bars (the monitor's own chart) — a backdated incident
 * would otherwise be drawn over an empty bucket, or fall off a short range entirely.
 */
type IncidentTimeAxis = "start" | "raised"

/** The moment an incident starts covering buckets, on the requested axis. */
function incidentStartMs(incident: AlertIncidentRecord, timeAxis: IncidentTimeAxis): number {
  return timeAxis === "raised" ? Date.parse(incident.createdAt) : Date.parse(incident.startedAt)
}

/** The moment a ranged incident stops covering buckets: its end, or `now` while it is open. */
function incidentEndMs(incident: AlertIncidentRecord, startMs: number, nowMs: number): number {
  if (!isRangedIncident(incident)) return startMs
  return incident.endedAt ? Date.parse(incident.endedAt) : nowMs
}

interface IncidentRange {
  readonly startIndex: number
  readonly endIndex: number
  readonly incident: AlertIncidentRecord
}

interface IncidentGrouping {
  /** Lookup of incidents whose placement moment (per the requested axis) snaps into a bucket index. */
  readonly incidentsByBucketIndex: ReadonlyMap<number, readonly AlertIncidentRecord[]>
  /**
   * Per-bucket list of every incident that **touches** the bucket — both point-in-time incidents
   * that started in it AND ranged incidents whose `[startIndex, endIndex]` covers it. Use this for
   * tooltips so a bucket in the middle of an escalation surfaces the escalation, not nothing.
   */
  readonly incidentsTouchingBucketIndex: ReadonlyMap<number, readonly AlertIncidentRecord[]>
  /** Ranges (start..end inclusive bucket indices) for incidents that span more than one instant. */
  readonly ranges: readonly IncidentRange[]
}

interface GroupIncidentsByBucketInput {
  readonly bucketStartsMs: readonly number[]
  readonly bucketWidthMs: number
  readonly incidents: readonly AlertIncidentRecord[]
  /** Used to clamp ongoing ranged incidents (`endedAt: null`) to the right edge of the chart. */
  readonly nowMs: number
  /** Defaults to `start`; pass `raised` when the chart's bars are activity-anchored. */
  readonly timeAxis?: IncidentTimeAxis
}

/**
 * Groups incidents by histogram bucket index. Decouples the snapping math from any specific chart
 * library so eCharts overlays AND a hand-rolled SVG/Tailwind chart can share the same logic.
 *
 * `bucketStartsMs` is the array of bucket start timestamps (ms epoch). `bucketWidthMs` is the
 * uniform bucket width — the snapping window for a bucket at index `i` is
 * `[bucketStartsMs[i], bucketStartsMs[i] + bucketWidthMs)`.
 */
export function groupIncidentsByBucket({
  bucketStartsMs,
  bucketWidthMs,
  incidents,
  nowMs,
  timeAxis = "start",
}: GroupIncidentsByBucketInput): IncidentGrouping {
  const empty: IncidentGrouping = {
    incidentsByBucketIndex: new Map(),
    incidentsTouchingBucketIndex: new Map(),
    ranges: [],
  }
  if (bucketStartsMs.length === 0 || incidents.length === 0) return empty

  const firstStartMs = bucketStartsMs[0]
  if (firstStartMs === undefined || !Number.isFinite(firstStartMs)) return empty
  const lastIndex = bucketStartsMs.length - 1

  const incidentsByBucketIndex = new Map<number, AlertIncidentRecord[]>()
  const incidentsTouchingBucketIndex = new Map<number, AlertIncidentRecord[]>()
  const ranges: IncidentRange[] = []
  const pushTouching = (bucketIndex: number, incident: AlertIncidentRecord) => {
    const existing = incidentsTouchingBucketIndex.get(bucketIndex) ?? []
    existing.push(incident)
    incidentsTouchingBucketIndex.set(bucketIndex, existing)
  }

  const lastBucketEndMs = firstStartMs + bucketWidthMs * (lastIndex + 1)

  for (const incident of incidents) {
    const startMs = incidentStartMs(incident, timeAxis)
    const endMs = incidentEndMs(incident, startMs, nowMs)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue
    // Only incidents whose extent misses the chart range entirely are dropped; the edges clamp.
    if (endMs < firstStartMs || startMs >= lastBucketEndMs) continue
    const startIdx = snapMsToBucketIndex(startMs, firstStartMs, bucketWidthMs, lastIndex)
    if (startIdx === null) continue

    const list = incidentsByBucketIndex.get(startIdx) ?? []
    list.push(incident)
    incidentsByBucketIndex.set(startIdx, list)
    pushTouching(startIdx, incident)

    if (isRangedIncident(incident)) {
      const endIdx = snapMsToBucketIndex(endMs, firstStartMs, bucketWidthMs, lastIndex)
      if (endIdx !== null) {
        ranges.push({ startIndex: startIdx, endIndex: endIdx, incident })
        for (let i = startIdx + 1; i <= endIdx; i++) {
          pushTouching(i, incident)
        }
      }
    }
  }

  return { incidentsByBucketIndex, incidentsTouchingBucketIndex, ranges }
}

interface BuildIncidentMarkersInput {
  readonly bucketStartsMs: readonly number[]
  readonly bucketWidthMs: number
  readonly incidents: readonly AlertIncidentRecord[]
  readonly nowMs: number
  /** Defaults to `start`; pass `raised` when the chart's bars are activity-anchored. */
  readonly timeAxis?: IncidentTimeAxis
}

interface BuildIncidentMarkersResult {
  readonly overlay: BarChartOverlay
  /** Incidents that **started** in the bucket — used for things like the per-incident marker pin. */
  readonly incidentsByBucketIndex: ReadonlyMap<number, readonly AlertIncidentRecord[]>
  /**
   * Incidents that touch the bucket (started in it OR a ranged incident covering it). Use this for
   * tooltips so a bucket inside an escalation range surfaces that escalation.
   */
  readonly incidentsTouchingBucketIndex: ReadonlyMap<number, readonly AlertIncidentRecord[]>
}

/**
 * Builds eCharts overlays from a list of incidents:
 * - point-in-time incidents (`endedAt === startedAt`) → vertical mark lines snapped to the bucket
 *   containing their placement moment (`startedAt`, or `createdAt` on the `raised` axis)
 * - ranged incidents (`endedAt > startedAt`, or `endedAt === null` for an open lifecycle) →
 *   translucent mark areas spanning `startedAt → endedAt` (clamped to `nowMs` when ongoing). The
 *   start line is always drawn so a 1-bucket range stays discoverable.
 */
export function buildIncidentMarkers({
  bucketStartsMs,
  bucketWidthMs,
  incidents,
  nowMs,
  timeAxis = "start",
}: BuildIncidentMarkersInput): BuildIncidentMarkersResult {
  const empty: BuildIncidentMarkersResult = {
    overlay: { lines: [], areas: [] },
    incidentsByBucketIndex: new Map(),
    incidentsTouchingBucketIndex: new Map(),
  }
  if (bucketStartsMs.length === 0 || incidents.length === 0) return empty

  const grouping = groupIncidentsByBucket({ bucketStartsMs, bucketWidthMs, incidents, nowMs, timeAxis })

  const lines: BarChartOverlayLine[] = []
  const areas: BarChartOverlayArea[] = []

  for (const [bucketIndex, bucketIncidents] of grouping.incidentsByBucketIndex) {
    for (const incident of bucketIncidents) {
      lines.push({
        categoryIndex: bucketIndex,
        color: SEVERITY_COLOR[incident.severity],
        dashed: false,
        topSymbol: KIND_TOP_SYMBOL[incident.kind],
      })
    }
  }

  for (const range of grouping.ranges) {
    areas.push({
      startCategoryIndex: range.startIndex,
      endCategoryIndex: range.endIndex,
      color: SEVERITY_COLOR[range.incident.severity],
      opacity: 0.16,
    })
  }

  return {
    overlay: { lines, areas },
    incidentsByBucketIndex: grouping.incidentsByBucketIndex,
    incidentsTouchingBucketIndex: grouping.incidentsTouchingBucketIndex,
  }
}

export function formatIncidentKindLabel(kind: IncidentNotificationKey): string {
  return INCIDENT_NOTIFICATION_KEY_LABEL[kind]
}
