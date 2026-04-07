import { NotFoundError } from "@domain/shared"
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
    listByTraceId: () => Effect.succeed([]),
    listByProjectId: () => Effect.succeed([]),
    findBySpanId: () => Effect.fail(new NotFoundError({ entity: "Span", id: "" })),
    findMessagesForTrace: () => Effect.succeed([]),
    ...overrides,
  }

  return { repository, inserted }
}
