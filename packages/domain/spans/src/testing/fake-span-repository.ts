import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { SpanDetail } from "../entities/span.ts"
import type { SpanRepositoryShape } from "../ports/span-repository.ts"

export const createFakeSpanRepository = (overrides?: Partial<SpanRepositoryShape>) => {
  const inserted: SpanDetail[][] = []

  const repository: SpanRepositoryShape = {
    // TODO(repositories): rename insert -> save to match the repository port
    // once the public write verb cleanup lands.
    insert: (spans) => {
      inserted.push([...spans])
      return Effect.void
    },
    listByTraceId: () => Effect.succeed([]),
    listBySessionId: () => Effect.succeed([]),
    listToolSpansBySessionId: () => Effect.succeed([]),
    listByProjectId: () => Effect.succeed([]),
    findBySpanId: () => Effect.fail(new NotFoundError({ entity: "Span", id: "" })),
    findMessagesForTrace: () => Effect.succeed([]),
    findMessagesForSession: () => Effect.succeed([]),
    findLatestOutputTraceId: () => Effect.succeed(null),
    listByIngestedAtWindow: () => Effect.succeed({ spans: [], nextCursor: null }),
    listRecentDetailsByProjectId: () => Effect.succeed([]),
    findIngestedAtFloorForRecentLimit: () => Effect.succeed(null),
    ...overrides,
  }

  return { repository, inserted }
}
