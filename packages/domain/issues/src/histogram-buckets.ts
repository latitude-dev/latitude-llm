import type { IssueOccurrenceBucket } from "@domain/scores"

/**
 * Sub-day-aware scaffold aligned to UTC bucket boundaries. Emits ISO-8601 UTC timestamps
 * (`YYYY-MM-DDTHH:MM:SS.000Z`) — the same shape the ClickHouse analytics histogram returns.
 * The scaffold starts at `floor(from / bucketWidth) * bucketWidth` and steps by `bucketSeconds`
 * up to and including the bucket containing `to`.
 *
 * Shared by every surface that renders an occurrence histogram (issues list mini-bar, the issue
 * detail trend, and the incident-notification trend snapshot) so empty buckets render as gaps
 * consistently instead of collapsing the time axis.
 */
export const buildHistogramBucketScaffold = (input: {
  readonly from: Date
  readonly to: Date
  readonly bucketSeconds: number
}): readonly string[] => {
  const widthMs = input.bucketSeconds * 1000
  if (widthMs <= 0) return []
  const startMs = Math.floor(input.from.getTime() / widthMs) * widthMs
  const endMs = input.to.getTime()
  const out: string[] = []
  for (let cursor = startMs; cursor <= endMs; cursor += widthMs) {
    out.push(new Date(cursor).toISOString())
  }
  return out
}

/**
 * Zero-fills a sparse histogram against a scaffold so every bucket in the window has an entry.
 * Buckets present in `buckets` keep their count; the rest default to `0`.
 */
export const fillBuckets = (input: {
  readonly scaffold: readonly string[]
  readonly buckets: readonly IssueOccurrenceBucket[]
}): readonly IssueOccurrenceBucket[] => {
  const countsByBucket = new Map(input.buckets.map((bucket) => [bucket.bucket, bucket.count] as const))
  return input.scaffold.map((bucket) => ({
    bucket,
    count: countsByBucket.get(bucket) ?? 0,
  }))
}
