import { Effect } from "effect"
import type { TraceSearchRepositoryShape } from "../ports/trace-search-repository.ts"

export const createFakeTraceSearchRepository = (overrides?: Partial<TraceSearchRepositoryShape>) => {
  const repository: TraceSearchRepositoryShape = {
    upsertDocument: () => Effect.void,
    upsertEmbedding: () => Effect.void,
    upsertMessageOccurrences: () => Effect.void,
    listMessageOccurrencesForTraces: () => Effect.succeed([]),
    hasEmbeddingWithHash: () => Effect.succeed(false),
    findSemanticHighlightForTrace: () => Effect.succeed(null),
    ...overrides,
  }

  return { repository }
}
