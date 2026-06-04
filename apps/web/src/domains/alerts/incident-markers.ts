import type { AlertIncidentKind, AlertSeverity } from "@domain/alerts"
import { ALERT_INCIDENT_KIND_LABEL } from "@domain/shared"
import type { BarChartOverlay, BarChartOverlayArea, BarChartOverlayLine } from "@repo/ui"
import type { AlertIncidentRecord } from "./alerts.functions.ts"

/**
 * Severity → Tailwind-aligned chart colors. We don't read these from CSS variables because the
 * `<canvas>` chart layer can't resolve `hsl(var(...))` — eCharts needs concrete strings. Keep
 * these in rough sync with the `Status` variants used elsewhere (warning ≈ amber, destructive ≈
 * red) so the histogram markers feel like the same family as the issue lifecycle badges.
 *
 * Exported so non-eCharts callers (e.g., the SVG-style `IssueTrendBar`) reuse the same palette.
 */
export const INCIDENT_SEVERITY_COLOR: Record<AlertSeverity, string> = {
  low: "hsl(217 91% 60%)",
  medium: "hsl(38 92% 50%)",
  high: "hsl(0 84% 60%)",
}

/**
 * Concrete hex equivalents of {@link INCIDENT_SEVERITY_COLOR}, for renderers that can't rely on
 * CSS `hsl()` parsing. usvg (the SVG parser behind the server-side Resvg incident-trend PNG)
 * does not reliably parse the space-separated `hsl(H S% L%)` syntax used above, so the hand-built
 * SVG markup references these instead. Values are the same Tailwind-500 colors (blue/amber/red).
 */
export const INCIDENT_SEVERITY_HEX: Record<AlertSeverity, string> = {
  low: "#3b82f6",
  medium: "#f59e0b",
  high: "#ef4444",
}

type TopSymbol = NonNullable<BarChartOverlayLine["topSymbol"]>

// Markers are paint-only — interactivity lives at the bucket level via the histogram's hover
// popover, not on the marker itself. Sizes are picked so each kind reads distinctly at a
// glance against a busy bar chart background.
const KIND_TOP_SYMBOL: Record<AlertIncidentKind, TopSymbol> = {
  "issue.new": { shape: "circle", size: 9 },
  "issue.regressed": { shape: "diamond", size: 10 },
  // Escalating typically renders as an area, but we still render a tiny tick at the start so a
  // 1-bucket escalation that snaps to a single cell stays visible.
  "issue.escalating": { shape: "rect", size: 7 },
  // Unused until M7 wires saved-search firing; shapes mirror the issue analogues.
  "savedSearch.match": { shape: "triangle", size: 9 },
  "savedSearch.threshold": { shape: "diamond", size: 10 },
  "savedSearch.escalating": { shape: "rect", size: 7 },
}

export const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
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
 * contains it. Returns `null` when the moment falls outside `[firstStartMs, firstStartMs + width *
 * (lastIndex + 1))` so callers drop those markers instead of piling them up at the edges.
 */
function snapMsToBucketIndex(
  ms: number,
  firstBucketStartMs: number,
  bucketWidthMs: number,
  lastIndex: number,
): number | null {
  if (!Number.isFinite(ms) || bucketWidthMs <= 0) return null
  const idx = Math.floor((ms - firstBucketStartMs) / bucketWidthMs)
  if (idx < 0 || idx > lastIndex) return null
  return idx
}

interface IncidentRange {
  readonly startIndex: number
  readonly endIndex: number
  readonly incident: AlertIncidentRecord
}

interface IncidentGrouping {
  /** Lookup of incidents whose `startedAt` snaps into a given bucket index. */
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

  for (const incident of incidents) {
    const startMs = Date.parse(incident.startedAt)
    const startIdx = snapMsToBucketIndex(startMs, firstStartMs, bucketWidthMs, lastIndex)
    if (startIdx === null) continue

    const list = incidentsByBucketIndex.get(startIdx) ?? []
    list.push(incident)
    incidentsByBucketIndex.set(startIdx, list)
    pushTouching(startIdx, incident)

    if (isRangedIncident(incident)) {
      const endMs = incident.endedAt ? Date.parse(incident.endedAt) : nowMs
      const snapped = snapMsToBucketIndex(endMs, firstStartMs, bucketWidthMs, lastIndex)
      // Clamp past-end to the last visible bucket so an in-progress incident paints to the edge.
      const endIdx = snapped ?? (Number.isFinite(endMs) && endMs >= firstStartMs ? lastIndex : null)
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
 *   containing `startedAt`
 * - ranged incidents (`endedAt > startedAt`, or `endedAt === null` for an open lifecycle) →
 *   translucent mark areas spanning `startedAt → endedAt` (clamped to `nowMs` when ongoing). The
 *   start line is always drawn so a 1-bucket range stays discoverable.
 */
export function buildIncidentMarkers({
  bucketStartsMs,
  bucketWidthMs,
  incidents,
  nowMs,
}: BuildIncidentMarkersInput): BuildIncidentMarkersResult {
  const empty: BuildIncidentMarkersResult = {
    overlay: { lines: [], areas: [] },
    incidentsByBucketIndex: new Map(),
    incidentsTouchingBucketIndex: new Map(),
  }
  if (bucketStartsMs.length === 0 || incidents.length === 0) return empty

  const grouping = groupIncidentsByBucket({ bucketStartsMs, bucketWidthMs, incidents, nowMs })

  const lines: BarChartOverlayLine[] = []
  const areas: BarChartOverlayArea[] = []

  for (const [bucketIndex, bucketIncidents] of grouping.incidentsByBucketIndex) {
    for (const incident of bucketIncidents) {
      lines.push({
        categoryIndex: bucketIndex,
        color: INCIDENT_SEVERITY_COLOR[incident.severity],
        dashed: incident.kind === "issue.regressed",
        topSymbol: KIND_TOP_SYMBOL[incident.kind],
      })
    }
  }

  for (const range of grouping.ranges) {
    areas.push({
      startCategoryIndex: range.startIndex,
      endCategoryIndex: range.endIndex,
      color: INCIDENT_SEVERITY_COLOR[range.incident.severity],
      opacity: 0.16,
    })
  }

  return {
    overlay: { lines, areas },
    incidentsByBucketIndex: grouping.incidentsByBucketIndex,
    incidentsTouchingBucketIndex: grouping.incidentsTouchingBucketIndex,
  }
}

export function formatIncidentKindLabel(kind: AlertIncidentKind): string {
  return ALERT_INCIDENT_KIND_LABEL[kind]
}
