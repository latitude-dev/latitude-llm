import type { AlertIncidentKind, AlertSeverity } from "@domain/alerts"
import type { TraceTimeHistogramBucket } from "@domain/spans"
import type { BarChartOverlay, BarChartOverlayArea, BarChartOverlayLine } from "@repo/ui"
import type { AlertIncidentRecord } from "../../../../../../domains/alerts/alerts.functions.ts"

/**
 * Severity → Tailwind-aligned chart colors. We don't read these from CSS variables because the
 * `<canvas>` chart layer can't resolve `hsl(var(...))` — eCharts needs concrete strings. Keep
 * these in rough sync with the `Status` variants used elsewhere (warning ≈ amber, destructive ≈
 * red) so the histogram markers feel like the same family as the issue lifecycle badges.
 */
const SEVERITY_LINE_COLOR: Record<AlertSeverity, string> = {
  medium: "hsl(38 92% 50%)",
  high: "hsl(0 84% 60%)",
}

const SEVERITY_AREA_COLOR: Record<AlertSeverity, string> = {
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
 * Snaps a moment to the **index** of the histogram bucket whose half-open `[start, start + width)`
 * range contains it. Returns `null` if the moment falls outside the histogram window — callers
 * should drop those markers so they don't pile up at the edges.
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

interface BuildIncidentMarkersInput {
  readonly buckets: readonly TraceTimeHistogramBucket[]
  readonly bucketSeconds: number
  readonly categories: readonly string[]
  readonly incidents: readonly AlertIncidentRecord[]
  /** Used to clamp ongoing escalations (`endedAt: null`) to the right edge of the chart. */
  readonly nowIso: string
}

interface BuildIncidentMarkersResult {
  readonly overlay: BarChartOverlay
  /** `dataIndex → incidents that landed in that bucket`. Used to enrich the histogram tooltip. */
  readonly incidentsByBucketIndex: ReadonlyMap<number, readonly AlertIncidentRecord[]>
}

/**
 * Builds eCharts overlays from a list of incidents:
 * - point-in-time kinds (`issue.new`, `issue.regressed`) → vertical mark lines snapped to the
 *   bucket containing `startedAt`
 * - ranged kinds (`issue.escalating`) → translucent mark areas spanning `startedAt → endedAt`
 *   (clamped to `nowIso` when ongoing). When the start and end snap to the same bucket the area
 *   would render zero-width — we draw the start line in addition so it stays discoverable.
 *
 * Density: the function does not deduplicate visually identical markers; eCharts handles the
 * stacking. The returned `incidentsByBucketIndex` is the source of truth for tooltip enrichment
 * so multiple incidents in the same bucket all surface to the user.
 */
export function buildIncidentMarkers({
  buckets,
  bucketSeconds,
  categories,
  incidents,
  nowIso,
}: BuildIncidentMarkersInput): BuildIncidentMarkersResult {
  const empty: BuildIncidentMarkersResult = {
    overlay: { lines: [], areas: [] },
    incidentsByBucketIndex: new Map(),
  }
  if (buckets.length === 0 || incidents.length === 0) return empty

  const firstBucket = buckets[0]
  const lastBucket = buckets[buckets.length - 1]
  if (!firstBucket || !lastBucket) return empty

  const bucketWidthMs = bucketSeconds * 1000
  const firstStartMs = Date.parse(firstBucket.bucketStart)
  if (!Number.isFinite(firstStartMs)) return empty
  const lastIndex = buckets.length - 1
  const nowMs = Date.parse(nowIso)

  const lines: BarChartOverlayLine[] = []
  const areas: BarChartOverlayArea[] = []
  const incidentsByBucketIndex = new Map<number, AlertIncidentRecord[]>()

  for (const incident of incidents) {
    const startMs = Date.parse(incident.startedAt)
    const startIdx = snapMsToBucketIndex(startMs, firstStartMs, bucketWidthMs, lastIndex)
    if (startIdx === null) continue
    const startCategory = categories[startIdx]
    if (startCategory === undefined) continue

    const list = incidentsByBucketIndex.get(startIdx) ?? []
    list.push(incident)
    incidentsByBucketIndex.set(startIdx, list)

    const isRanged = RANGED_KINDS.has(incident.kind)
    if (isRanged) {
      const endMs = incident.endedAt ? Date.parse(incident.endedAt) : nowMs
      const endIdx =
        snapMsToBucketIndex(endMs, firstStartMs, bucketWidthMs, lastIndex) ??
        // If the end clamps past the right edge, draw the area through the last visible bucket.
        (Number.isFinite(endMs) && endMs >= firstStartMs ? lastIndex : null)
      if (endIdx !== null) {
        const endCategory = categories[endIdx]
        if (endCategory !== undefined) {
          areas.push({
            startCategory,
            endCategory,
            color: SEVERITY_AREA_COLOR[incident.severity],
            opacity: 0.16,
          })
        }
      }
    }

    // Always draw a thin tick at the start. For ranged kinds it doubles as a "this is where
    // it began" marker; for point-in-time kinds it's the only visual.
    lines.push({
      category: startCategory,
      color: SEVERITY_LINE_COLOR[incident.severity],
      dashed: incident.kind === "issue.regressed",
      topSymbol: KIND_TOP_SYMBOL[incident.kind],
    })
  }

  return { overlay: { lines, areas }, incidentsByBucketIndex }
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
 */
export function renderIncidentsTooltipBlock(incidents: readonly AlertIncidentRecord[]): string {
  if (incidents.length === 0) return ""
  const header = `<div style="margin-top:6px;font-weight:600;">${incidents.length === 1 ? "Incident" : `${incidents.length} incidents`}</div>`
  const items = incidents
    .map((incident) => {
      const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${SEVERITY_LINE_COLOR[incident.severity]};margin-right:6px;vertical-align:middle"></span>`
      const kindLabel = KIND_LABELS[incident.kind]
      const sevLabel = SEVERITY_LABELS[incident.severity]
      const issueLine = incident.issueName
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
