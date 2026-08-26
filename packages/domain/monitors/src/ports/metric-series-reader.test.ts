import { seasonalAnomalyThreshold } from "@domain/incidents"
import { ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  type MetricSeriesReaderShape,
  type MetricSeriesTarget,
  makeMetricSeriesReaderSeriesReader,
} from "./metric-series-reader.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const now = new Date("2026-06-23T12:00:00.000Z")
const target: MetricSeriesTarget = {
  stream: "traces",
  filterSet: {},
  query: null,
  metric: { kind: "count" },
  timeAxis: "start",
}

const hours = (from: Date, to: Date) => (to.getTime() - from.getTime()) / (60 * 60 * 1000)

const reader: MetricSeriesReaderShape = {
  valueInWindow: ({ from, to }) => {
    if (to.getTime() === now.getTime()) {
      if (hours(from, to) === 1) return Effect.succeed(30)
      if (hours(from, to) === 6) return Effect.succeed(180)
      return Effect.succeed(300)
    }
    if (hours(from, to) === 6) return Effect.succeed(72)
    return Effect.succeed(8)
  },
  firstEventAt: () => Effect.succeed(null),
  lastEventAt: () => Effect.succeed(null),
  seriesPerBucket: () => Effect.succeed([4, 12]),
}

describe("makeMetricSeriesReaderSeriesReader", () => {
  it("builds monitor seasonal signals and crossing thresholds from metric history", async () => {
    const seriesReader = makeMetricSeriesReaderSeriesReader(reader, { resolveTarget: () => target })

    const signals = await Effect.runPromise(
      seriesReader
        .readSeasonalSeries({ organizationId, projectId, sourceId: "monitor-1", now })
        .pipe(Effect.provideService(ChSqlClient, null as never)),
    )
    expect(signals).toEqual({
      recent1h: 30,
      recent6h: 180,
      recent24h: 300,
      expected1h: 8,
      expected6hPerHour: 12,
      stddev1h: 0,
      stddev6hPerHour: 0,
      samplesCount: 4,
    })

    const buckets = await Effect.runPromise(
      seriesReader
        .readCrossingBuckets({
          organizationId,
          projectId,
          sourceId: "monitor-1",
          from: new Date("2026-06-23T10:00:00.000Z"),
          to: now,
          bucketSeconds: 60 * 60,
          kShort: 3,
        })
        .pipe(Effect.provideService(ChSqlClient, null as never)),
    )
    expect(buckets.counts.map((bucket) => bucket.count)).toEqual([4, 12])
    expect(buckets.thresholds.map((bucket) => bucket.thresholdCount)).toEqual([
      seasonalAnomalyThreshold(8, 0, 3),
      seasonalAnomalyThreshold(8, 0, 3),
    ])
  })
})
