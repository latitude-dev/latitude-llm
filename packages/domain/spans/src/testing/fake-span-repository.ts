import { Effect } from "effect"
import type { SpanDetail } from "../entities/span.ts"
import type { SpanRepositoryShape } from "../ports/span-repository.ts"

export const createFakeSpanRepository = (overrides?: Partial<SpanRepositoryShape>) => {
  const inserted: SpanDetail[][] = []

  const repository: SpanRepositoryShape = {
    insert: (spans) => {
      inserted.push([...spans])
      return Effect.void
    },
    findByTraceId: () => Effect.succeed([]),
    findByProjectId: () => Effect.succeed([]),
    findBySpanId: () => Effect.succeed(null),
    findMessagesForTrace: () => Effect.succeed([]),
    ...overrides,
  }

  return { repository, inserted }
}
