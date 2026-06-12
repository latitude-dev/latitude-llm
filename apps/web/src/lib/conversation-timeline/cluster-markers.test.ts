import { describe, expect, it } from "vitest"
import type { TimelineMarker } from "./build-conversation-timeline.ts"
import { clusterMarkers, type PositionedMarker } from "./cluster-markers.ts"

const marker = (id: string): TimelineMarker => ({
  kind: "toolCall",
  atMs: 0,
  spanId: id,
  toolCallId: null,
  label: id,
  durationMs: 100,
  errorExcerpt: null,
})

const positioned = (id: string, leftPct: number, timelineMs = leftPct * 100): PositionedMarker => ({
  marker: marker(id),
  timelineMs,
  leftPct,
})

const spanIds = (markers: readonly TimelineMarker[]) => markers.map((m) => (m.kind === "toolCall" ? m.spanId : ""))

describe("clusterMarkers", () => {
  it("returns no clusters for no markers", () => {
    expect(clusterMarkers([])).toEqual([])
  })

  it("keeps far-apart markers as singletons in position order", () => {
    const clusters = clusterMarkers([positioned("b", 50), positioned("a", 10), positioned("c", 90)])
    expect(clusters.map((c) => spanIds(c.markers))).toEqual([["a"], ["b"], ["c"]])
    expect(clusters.map((c) => c.leftPct)).toEqual([10, 50, 90])
  })

  it("merges markers within the threshold", () => {
    const clusters = clusterMarkers([positioned("a", 10), positioned("b", 11)])
    expect(clusters).toHaveLength(1)
    expect(spanIds(clusters[0]?.markers ?? [])).toEqual(["a", "b"])
    expect(clusters[0]?.leftPct).toBe(10.5)
  })

  it("bounds clusters to one chip-width — chains do not merge transitively", () => {
    const clusters = clusterMarkers([positioned("a", 10), positioned("b", 11.5), positioned("c", 13)])
    expect(clusters.map((c) => spanIds(c.markers))).toEqual([["a", "b"], ["c"]])
    expect(clusters.map((c) => c.leftPct)).toEqual([10.75, 13])
  })

  it("packs a dense lane into many chips instead of one mega-cluster", () => {
    const items = Array.from({ length: 100 }, (_, i) => positioned(`m${i}`, i))
    const clusters = clusterMarkers(items, 1.8)
    expect(clusters).toHaveLength(50)
    expect(clusters.every((c) => c.markers.length === 2)).toBe(true)
  })

  it("merges markers at identical positions", () => {
    const clusters = clusterMarkers([positioned("a", 42), positioned("b", 42)])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]?.markers).toHaveLength(2)
  })

  it("uses the earliest member's time as the seek target", () => {
    const clusters = clusterMarkers([positioned("late", 10.5, 9_999), positioned("early", 10, 5_000)])
    expect(clusters[0]?.timelineMs).toBe(5_000)
  })

  it("respects a custom threshold", () => {
    const items = [positioned("a", 10), positioned("b", 14)]
    expect(clusterMarkers(items)).toHaveLength(2)
    expect(clusterMarkers(items, 5)).toHaveLength(1)
  })
})
