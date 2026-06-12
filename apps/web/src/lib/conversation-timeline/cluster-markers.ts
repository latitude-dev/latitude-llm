import type { TimelineMarker } from "./build-conversation-timeline.ts"

export const MARKER_CLUSTER_THRESHOLD_PCT = 1.8

export interface PositionedMarker {
  readonly marker: TimelineMarker
  readonly timelineMs: number
  readonly leftPct: number
}

export interface MarkerCluster {
  /** Midpoint of the first and last member positions. */
  readonly leftPct: number
  /** Earliest member's time — the seek target. */
  readonly timelineMs: number
  readonly markers: readonly TimelineMarker[]
}

/**
 * Groups markers that would visually overlap on the lane: a greedy sweep over
 * position-sorted markers where a marker joins the cluster only while it is
 * within the threshold of the cluster's FIRST member. Anchoring to the first
 * member bounds every cluster to one chip-width — a dense lane packs into as
 * many chips as fit instead of chaining into a single mega-cluster. Clustering
 * is purely visual — dwell stops and seek targets keep using the raw markers.
 */
export function clusterMarkers(
  items: readonly PositionedMarker[],
  thresholdPct: number = MARKER_CLUSTER_THRESHOLD_PCT,
): readonly MarkerCluster[] {
  const sorted = [...items].sort((a, b) => a.leftPct - b.leftPct)
  const clusters: MarkerCluster[] = []
  let run: PositionedMarker[] = []

  const flush = () => {
    const first = run[0]
    const last = run[run.length - 1]
    if (!first || !last) return
    clusters.push({
      leftPct: (first.leftPct + last.leftPct) / 2,
      timelineMs: run.reduce((min, item) => Math.min(min, item.timelineMs), first.timelineMs),
      markers: run.map((item) => item.marker),
    })
    run = []
  }

  for (const item of sorted) {
    const first = run[0]
    if (first && item.leftPct - first.leftPct > thresholdPct) flush()
    run.push(item)
  }
  flush()
  return clusters
}
