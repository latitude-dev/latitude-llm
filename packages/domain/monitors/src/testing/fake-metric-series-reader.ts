import { Effect, Layer } from "effect"
import {
  type MetricSeriesBucketInput,
  MetricSeriesReader,
  type MetricSeriesWindowInput,
} from "../ports/metric-series-reader.ts"

/**
 * In-memory `MetricSeriesReader` for unit tests: seed matching-event
 * `start_time`s, and the methods window them by `[from, to)` as a `count` metric.
 */
export const createFakeMetricSeriesReader = (matchTimestamps: readonly Date[] = []) => {
  const calls: Array<MetricSeriesWindowInput | MetricSeriesBucketInput> = []
  const inWindow = (input: MetricSeriesWindowInput) =>
    matchTimestamps.filter((at) => at.getTime() >= input.from.getTime() && at.getTime() < input.to.getTime())

  // Mirror the ClickHouse impl: `N = floor((to - from) / bucketMs)` buckets
  // aligned to `to`, newest-first (index 0 ends at `to`), zero-filled.
  const series = (input: MetricSeriesBucketInput): number[] => {
    const bucketCount = Math.max(0, Math.floor((input.to.getTime() - input.from.getTime()) / input.bucketMs))
    const counts = new Array<number>(bucketCount).fill(0)
    for (const at of inWindow(input)) {
      const index = Math.floor((input.to.getTime() - at.getTime()) / input.bucketMs)
      if (index >= 0 && index < bucketCount) counts[index] += 1
    }
    return counts
  }

  const layer = Layer.succeed(MetricSeriesReader, {
    valueInWindow: (input) =>
      Effect.sync(() => {
        calls.push(input)
        return inWindow(input).length
      }),
    firstEventAt: (input) =>
      Effect.sync(() => {
        calls.push(input)
        return inWindow(input).reduce<Date | null>((earliest, at) => (earliest && earliest <= at ? earliest : at), null)
      }),
    lastEventAt: (input) =>
      Effect.sync(() => {
        calls.push(input)
        return inWindow(input).reduce<Date | null>((latest, at) => (latest && latest >= at ? latest : at), null)
      }),
    seriesPerBucket: (input) =>
      Effect.sync(() => {
        calls.push(input)
        return series(input)
      }),
  })

  return { layer, calls }
}
