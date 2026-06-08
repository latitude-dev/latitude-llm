import { Effect, Layer } from "effect"
import {
  type SavedSearchMatchBucketInput,
  SavedSearchMatchReader,
  type SavedSearchMatchWindowInput,
} from "../ports/saved-search-match-reader.ts"

/**
 * In-memory `SavedSearchMatchReader` for unit tests: seed matching trace
 * `start_time`s, and the methods window them by `[from, to)`. `target` is ignored
 * (match semantics are the reader's job, covered by the platform test).
 */
export const createFakeSavedSearchMatchReader = (matchTimestamps: readonly Date[] = []) => {
  const inWindow = (input: SavedSearchMatchWindowInput) =>
    matchTimestamps.filter((at) => at.getTime() >= input.from.getTime() && at.getTime() < input.to.getTime())

  // Mirror the ClickHouse impl: `N = floor((to - from) / bucketMs)` buckets
  // aligned to `to`, newest-first (index 0 ends at `to`), zero-filled.
  const bucketCounts = (input: SavedSearchMatchBucketInput): number[] => {
    const bucketCount = Math.max(0, Math.floor((input.to.getTime() - input.from.getTime()) / input.bucketMs))
    const counts = new Array<number>(bucketCount).fill(0)
    for (const at of inWindow(input)) {
      const index = Math.floor((input.to.getTime() - at.getTime()) / input.bucketMs)
      if (index >= 0 && index < bucketCount) counts[index] += 1
    }
    return counts
  }

  const layer = Layer.succeed(SavedSearchMatchReader, {
    countMatches: (input) => Effect.succeed(inWindow(input).length),
    firstMatchAt: (input) =>
      Effect.succeed(
        inWindow(input).reduce<Date | null>((earliest, at) => (earliest && earliest <= at ? earliest : at), null),
      ),
    countMatchesPerBucket: (input) => Effect.succeed(bucketCounts(input)),
  })

  return { layer }
}
