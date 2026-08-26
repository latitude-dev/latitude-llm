import { Effect, Layer } from "effect"
import {
  type MetricSeriesBucketInput,
  MetricSeriesReader,
  type MetricSeriesWindowInput,
} from "../ports/metric-series-reader.ts"

/** A seeded matching entity. A bare `Date` is an instant event — it starts and completes at once. */
export type FakeMatch = Date | { readonly startedAt: Date; readonly completedAt: Date }

const startOf = (match: FakeMatch): Date => (match instanceof Date ? match : match.startedAt)
const completionOf = (match: FakeMatch): Date => (match instanceof Date ? match : match.completedAt)

/** In-memory `MetricSeriesReader` for unit tests: seed matching entities, and the methods window and report them on the target's axis as a `count` metric. */
export const createFakeMetricSeriesReader = (matches: readonly FakeMatch[] = []) => {
  const calls: Array<MetricSeriesWindowInput | MetricSeriesBucketInput> = []
  const axisTimeOf = (input: MetricSeriesWindowInput, match: FakeMatch): Date =>
    input.target.timeAxis === "completion" ? completionOf(match) : startOf(match)
  const inWindow = (input: MetricSeriesWindowInput) =>
    matches
      .filter((match) => {
        const at = axisTimeOf(input, match).getTime()
        return at >= input.from.getTime() && at < input.to.getTime()
      })
      .map((match) => axisTimeOf(input, match))

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
