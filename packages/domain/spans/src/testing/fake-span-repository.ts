import { Effect } from "effect"
import type { SpanDetail } from "../entities/span.ts"
import type { SpanRepositoryShape } from "../ports/span-repository.ts"

export const createFakeSpanRepository = (overrides?: Partial<SpanRepositoryShape>) => {
  const inserted: SpanDetail[][] = []

  const listByTraceId = overrides?.listByTraceId ?? overrides?.findByTraceId ?? (() => Effect.succeed([]))
  const findByTraceId = overrides?.findByTraceId ?? overrides?.listByTraceId ?? listByTraceId
  const listByProjectId = overrides?.listByProjectId ?? overrides?.findByProjectId ?? (() => Effect.succeed([]))
  const findByProjectId = overrides?.findByProjectId ?? overrides?.listByProjectId ?? listByProjectId

  const repository: SpanRepositoryShape = {
    insert: (spans) => {
      inserted.push([...spans])
      return Effect.void
    },
    listByTraceId,
    findByTraceId,
    listByProjectId,
    findByProjectId,
    findBySpanId: () => Effect.succeed(null),
    findMessagesForTrace: () => Effect.succeed([]),
    ...overrides,
  }

  return { repository, inserted }
}
