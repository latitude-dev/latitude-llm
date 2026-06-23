import type { CrossingBuckets, SeriesReaderShape } from "@domain/incidents"
import type { ScoreAnalyticsRepositoryShape } from "@domain/scores"
import { SignalId } from "@domain/shared"
import { Effect } from "effect"

export const makeScoreOccurrenceReader = (analytics: ScoreAnalyticsRepositoryShape): SeriesReaderShape => ({
  readSeasonalSeries: (input) =>
    analytics
      .escalationSignalsBySignals({
        organizationId: input.organizationId,
        projectId: input.projectId,
        signalIds: [SignalId(input.sourceId)],
        now: input.now,
      })
      .pipe(Effect.map((entries) => entries[0] ?? null)),
  readCrossingBuckets: (input) =>
    Effect.gen(function* () {
      const [counts, thresholds] = yield* Effect.all(
        [
          analytics.histogramBySignals({
            organizationId: input.organizationId,
            projectId: input.projectId,
            signalIds: [SignalId(input.sourceId)],
            timeRange: { from: input.from, to: input.to },
            bucketSeconds: input.bucketSeconds,
          }),
          analytics.escalationThresholdHistogramBySignals({
            organizationId: input.organizationId,
            projectId: input.projectId,
            signalIds: [SignalId(input.sourceId)],
            timeRange: { from: input.from, to: input.to },
            bucketSeconds: input.bucketSeconds,
            kShort: input.kShort,
          }),
        ],
        { concurrency: "unbounded" },
      )

      return {
        counts,
        thresholds: thresholds[0]?.buckets ?? [],
      } satisfies CrossingBuckets
    }),
})
