import { ChSqlClient, type FilterSet, type ProjectId, type RepositoryError, type TraceId } from "@domain/shared"
import { type TraceListCursor, TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { MAX_TRACES_PER_QUEUE_IMPORT } from "../constants.ts"
import { TooManyTracesSelectedError } from "../errors.ts"

export type TraceSelection =
  | { readonly mode: "selected"; readonly traceIds: readonly TraceId[] }
  | { readonly mode: "all"; readonly filters?: FilterSet }
  | { readonly mode: "allExcept"; readonly traceIds: readonly TraceId[]; readonly filters?: FilterSet }

interface QueueItemInput {
  readonly traceId: TraceId
  readonly traceCreatedAt: Date
}

const PAGE_SIZE = 1_000

function collectAllTraces(args: { readonly projectId: ProjectId; readonly filters?: FilterSet }) {
  return Effect.gen(function* () {
    const chSqlClient = yield* ChSqlClient
    const repo = yield* TraceRepository
    const items: QueueItemInput[] = []
    let cursor: TraceListCursor | undefined

    while (true) {
      const page = yield* repo.listByProjectId({
        organizationId: chSqlClient.organizationId,
        projectId: args.projectId,
        options: {
          limit: PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
          ...(args.filters ? { filters: args.filters } : {}),
        },
      })
      for (const trace of page.items) {
        items.push({ traceId: trace.traceId, traceCreatedAt: trace.startTime })
      }
      if (!page.hasMore || !page.nextCursor) break
      cursor = page.nextCursor
    }

    return items
  })
}

function fetchTracesById(args: { readonly projectId: ProjectId; readonly traceIds: readonly TraceId[] }) {
  return Effect.gen(function* () {
    if (args.traceIds.length === 0) return []

    const chSqlClient = yield* ChSqlClient
    const repo = yield* TraceRepository
    const traces = yield* repo.listByTraceIds({
      organizationId: chSqlClient.organizationId,
      projectId: args.projectId,
      traceIds: args.traceIds,
    })
    return traces.map((t) => ({ traceId: t.traceId, traceCreatedAt: t.startTime }))
  })
}

type ResolveQueueItemsError = TooManyTracesSelectedError | RepositoryError

export function resolveQueueItems(args: {
  readonly projectId: ProjectId
  readonly selection: TraceSelection
}): Effect.Effect<readonly QueueItemInput[], ResolveQueueItemsError, ChSqlClient | TraceRepository> {
  return Effect.gen(function* () {
    if (args.selection.mode === "selected") {
      if (args.selection.traceIds.length === 0) return []

      if (args.selection.traceIds.length > MAX_TRACES_PER_QUEUE_IMPORT) {
        return yield* new TooManyTracesSelectedError({
          count: args.selection.traceIds.length,
          limit: MAX_TRACES_PER_QUEUE_IMPORT,
        })
      }

      return yield* fetchTracesById({
        projectId: args.projectId,
        traceIds: args.selection.traceIds,
      })
    }

    const allItems = yield* collectAllTraces({
      projectId: args.projectId,
      ...(args.selection.filters ? { filters: args.selection.filters } : {}),
    })

    if (args.selection.mode === "all") {
      if (allItems.length > MAX_TRACES_PER_QUEUE_IMPORT) {
        return yield* new TooManyTracesSelectedError({
          count: allItems.length,
          limit: MAX_TRACES_PER_QUEUE_IMPORT,
        })
      }
      return allItems
    }

    const excluded = new Set<string>(args.selection.traceIds as readonly string[])
    const filtered = allItems.filter((item) => !excluded.has(item.traceId as string))

    if (filtered.length > MAX_TRACES_PER_QUEUE_IMPORT) {
      return yield* new TooManyTracesSelectedError({
        count: filtered.length,
        limit: MAX_TRACES_PER_QUEUE_IMPORT,
      })
    }

    return filtered
  })
}
