import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, ValidationError } from "@domain/shared"
import { Context, type Effect } from "effect"

export interface SeasonalSeriesSignals {
  readonly recent1h: number
  readonly recent6h: number
  readonly recent24h: number
  readonly expected1h: number
  readonly expected6hPerHour: number
  readonly stddev1h: number
  readonly stddev6hPerHour: number
  readonly samplesCount: number
}

export interface SeriesBucket {
  readonly bucket: string
  readonly count: number
}

export interface SeriesThresholdBucket {
  readonly bucket: string
  readonly thresholdCount: number
}

export interface ReadSeasonalSeriesInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sourceId: string
  readonly now: Date
}

export interface ReadCrossingBucketsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sourceId: string
  readonly from: Date
  readonly to: Date
  readonly bucketSeconds: number
  readonly kShort: number
}

export interface CrossingBuckets {
  readonly counts: readonly SeriesBucket[]
  readonly thresholds: readonly SeriesThresholdBucket[]
}

export interface SeriesReaderShape {
  readSeasonalSeries(
    input: ReadSeasonalSeriesInput,
  ): Effect.Effect<SeasonalSeriesSignals | null, RepositoryError | ValidationError, ChSqlClient>
  readCrossingBuckets(
    input: ReadCrossingBucketsInput,
  ): Effect.Effect<CrossingBuckets, RepositoryError | ValidationError, ChSqlClient>
}

export class SeriesReader extends Context.Service<SeriesReader, SeriesReaderShape>()(
  "@domain/incidents/SeriesReader",
) {}
