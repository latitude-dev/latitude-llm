import { Effect, Layer } from "effect"
import {
  type MatchingEntity,
  type MetricSeriesBucketInput,
  MetricSeriesReader,
  type MetricSeriesWindowInput,
} from "../ports/metric-series-reader.ts"

/**
 * A seeded matching entity. `startedAt` is the backdate axis, `endedAt` the
 * activity axis the windows filter on — a long run has `endedAt` far after
 * `startedAt`. Entities sharing an `id` collapse into one, like a session's
 * traces do under the count metric's dedup grain.
 */
export interface FakeMetricEvent {
  readonly id?: string
  readonly startedAt: Date
  /** Defaults to `startedAt`, i.e. an instantaneous event. */
  readonly endedAt?: Date
}

/** A bare `Date` seeds an instantaneous event (start = end), which is all most cases need. */
export type FakeMetricEventInput = Date | FakeMetricEvent

interface NormalizedEvent {
  readonly id: string
  readonly startedAt: Date
  readonly endedAt: Date
}

const normalize = (event: FakeMetricEventInput, index: number): NormalizedEvent =>
  event instanceof Date
    ? { id: `event-${index}`, startedAt: event, endedAt: event }
    : { id: event.id ?? `event-${index}`, startedAt: event.startedAt, endedAt: event.endedAt ?? event.startedAt }

/**
 * In-memory `MetricSeriesReader` for unit tests: seed matching entities, and the
 * methods window them by `[from, to)` on the activity axis as a `count` metric.
 */
export const createFakeMetricSeriesReader = (events: readonly FakeMetricEventInput[] = []) => {
  const calls: Array<MetricSeriesWindowInput | MetricSeriesBucketInput> = []
  const seeded = events.map(normalize)

  const inWindow = (input: MetricSeriesWindowInput): NormalizedEvent[] =>
    seeded.filter(
      (event) => event.endedAt.getTime() >= input.from.getTime() && event.endedAt.getTime() < input.to.getTime(),
    )

  const entities = (input: MetricSeriesWindowInput): MatchingEntity[] => {
    const earliestById = new Map<string, Date>()
    for (const event of inWindow(input)) {
      const earliest = earliestById.get(event.id)
      if (earliest === undefined || event.startedAt < earliest) earliestById.set(event.id, event.startedAt)
    }
    return [...earliestById.entries()]
      .map(([id, startTime]) => ({ id, startTime }))
      .sort((left, right) => left.startTime.getTime() - right.startTime.getTime())
  }

  // Mirror the ClickHouse impl: `N = floor((to - from) / bucketMs)` buckets
  // aligned to `to`, newest-first (index 0 ends at `to`), zero-filled.
  const series = (input: MetricSeriesBucketInput): number[] => {
    const bucketCount = Math.max(0, Math.floor((input.to.getTime() - input.from.getTime()) / input.bucketMs))
    const counts = new Array<number>(bucketCount).fill(0)
    for (const event of inWindow(input)) {
      const index = Math.floor((input.to.getTime() - event.endedAt.getTime()) / input.bucketMs)
      if (index >= 0 && index < bucketCount) counts[index] += 1
    }
    return counts
  }

  const layer = Layer.succeed(MetricSeriesReader, {
    valueInWindow: (input) =>
      Effect.sync(() => {
        calls.push(input)
        return entities(input).length
      }),
    matchingEntities: (input) =>
      Effect.sync(() => {
        calls.push(input)
        return entities(input)
      }),
    firstEventAt: (input) =>
      Effect.sync(() => {
        calls.push(input)
        return inWindow(input).reduce<Date | null>(
          (earliest, event) => (earliest && earliest <= event.startedAt ? earliest : event.startedAt),
          null,
        )
      }),
    lastEventAt: (input) =>
      Effect.sync(() => {
        calls.push(input)
        return inWindow(input).reduce<Date | null>(
          (latest, event) => (latest && latest >= event.endedAt ? latest : event.endedAt),
          null,
        )
      }),
    seriesPerBucket: (input) =>
      Effect.sync(() => {
        calls.push(input)
        return series(input)
      }),
  })

  return { layer, calls }
}
