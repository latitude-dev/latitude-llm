import { Effect, Layer } from "effect"
import { SavedSearchMatchReader, type SavedSearchMatchWindowInput } from "../ports/saved-search-match-reader.ts"

/**
 * In-memory `SavedSearchMatchReader` for unit tests: seed matching trace
 * `start_time`s, and the methods window them by `[from, to)`. `target` is ignored
 * (match semantics are the reader's job, covered by the platform test).
 */
export const createFakeSavedSearchMatchReader = (matchTimestamps: readonly Date[] = []) => {
  const inWindow = (input: SavedSearchMatchWindowInput) =>
    matchTimestamps.filter((at) => at.getTime() >= input.from.getTime() && at.getTime() < input.to.getTime())

  const layer = Layer.succeed(SavedSearchMatchReader, {
    countMatches: (input) => Effect.succeed(inWindow(input).length),
    firstMatchAt: (input) =>
      Effect.succeed(
        inWindow(input).reduce<Date | null>((earliest, at) => (earliest && earliest <= at ? earliest : at), null),
      ),
  })

  return { layer }
}
