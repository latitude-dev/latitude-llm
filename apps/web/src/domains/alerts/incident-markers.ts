import type { AlertIncidentKind, AlertSeverity } from "@domain/alerts"
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
  medium: "hsl(38 92% 50%)",
  high: "hsl(0 84% 60%)",
}

type TopSymbol = NonNullable<BarChartOverlayLine["topSymbol"]>

const KIND_TOP_SYMBOL: Record<AlertIncidentKind, TopSymbol> = {
  "issue.new": { shape: "circle", size: 7 },
  "issue.regressed": { shape: "diamond", size: 8 },
  // Escalating renders as an area, but we still render a tiny tick at the start so a 1-bucket
  // escalation that snaps to a single cell stays visible.
  "issue.escalating": { shape: "rect", size: 6 },
}

const KIND_LABELS: Record<AlertIncidentKind, string> = {
  "issue.new": "New issue",
  "issue.regressed": "Issue regressed",
  "issue.escalating": "Issue escalating",
}

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  medium: "Medium",
  high: "High",
}

const RANGED_KINDS: ReadonlySet<AlertIncidentKind> = new Set<AlertIncidentKind>(["issue.escalating"])

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
  /** Ranges (start..end inclusive bucket indices) for ranged kinds like `issue.escalating`. */
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

    if (RANGED_KINDS.has(incident.kind)) {
      const endMs = incident.endedAt ? Date.parse(incident.endedAt) : nowMs
      const snapped = snapMsToBucketIndex(endMs, firstStartMs, bucketWidthMs, lastIndex)
      // Clamp past-end to the last visible bucket so an in-progress escalation paints to the edge.
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
 * - point-in-time kinds (`issue.new`, `issue.regressed`) → vertical mark lines snapped to the
 *   bucket containing `startedAt`
 * - ranged kinds (`issue.escalating`) → translucent mark areas spanning `startedAt → endedAt`
 *   (clamped to `nowMs` when ongoing). When start and end snap to the same bucket the area would
 *   render zero-width — we still draw the start line so it stays discoverable.
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

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      default:
        return "&#39;"
    }
  })

const formatTimeShort = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

/**
 * Renders the per-bucket incident block appended below the bar tooltip body. Returns an empty
 * string when no incidents fall in the bucket — callers can concatenate unconditionally.
 *
 * `omitIssueName` skips the issue name line; useful when the chart is already scoped to a single
 * issue so repeating its name on every incident row is just noise.
 */
export function renderIncidentsTooltipBlock(
  incidents: readonly AlertIncidentRecord[],
  options?: { readonly omitIssueName?: boolean },
): string {
  if (incidents.length === 0) return ""
  const header = `<div style="margin-top:6px;font-weight:600;">${incidents.length === 1 ? "Incident" : `${incidents.length} incidents`}</div>`
  const items = incidents
    .map((incident) => {
      const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${INCIDENT_SEVERITY_COLOR[incident.severity]};margin-right:6px;vertical-align:middle"></span>`
      const kindLabel = KIND_LABELS[incident.kind]
      const sevLabel = SEVERITY_LABELS[incident.severity]
      const issueLine =
        incident.issueName && !options?.omitIssueName
          ? `<div style="opacity:0.85;margin-left:14px;">${escapeHtml(incident.issueName)}</div>`
          : ""
      const timing =
        incident.kind === "issue.escalating" && incident.endedAt
          ? `${formatTimeShort(incident.startedAt)} → ${formatTimeShort(incident.endedAt)}`
          : incident.kind === "issue.escalating"
            ? `${formatTimeShort(incident.startedAt)} → ongoing`
            : formatTimeShort(incident.startedAt)
      return `<div style="margin-top:4px">${dot}<b>${kindLabel}</b> · <span style="opacity:0.75">${sevLabel}</span><div style="margin-left:14px;opacity:0.65;font-size:11px">${escapeHtml(timing)}</div>${issueLine}</div>`
    })
    .join("")
  return `${header}${items}`
}

export function formatIncidentKindLabel(kind: AlertIncidentKind): string {
  return KIND_LABELS[kind]
}
