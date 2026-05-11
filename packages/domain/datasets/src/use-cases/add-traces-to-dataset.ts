import { ScoreAnalyticsRepository } from "@domain/scores"
import type { DatasetId, FilterSet, IssueId, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { ChSqlClient } from "@domain/shared"
import type { TraceDetail, TraceListCursor } from "@domain/spans"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { MAX_TRACES_PER_DATASET_IMPORT } from "../constants.ts"
import { TooManyTracesError } from "../errors.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository } from "../ports/dataset-row-repository.ts"
import { createDataset } from "./create-dataset.ts"
import { insertRows } from "./insert-rows.ts"

export type TraceSelection =
  | { readonly mode: "selected"; readonly traceIds: readonly TraceId[] }
  | { readonly mode: "all" }
  | { readonly mode: "allExcept"; readonly traceIds: readonly TraceId[] }

export type TraceSource = { readonly kind: "project" } | { readonly kind: "issue"; readonly issueId: IssueId }

function mapTraceToRow(t: TraceDetail) {
  return {
    input: t.inputMessages as unknown as Record<string, unknown>,
    output: t.outputMessages as unknown as Record<string, unknown>,
    metadata: {
      traceId: t.traceId,
      rootSpanName: t.rootSpanName,
      models: t.models,
      durationNs: t.durationNs,
      tokensInput: t.tokensInput,
      tokensOutput: t.tokensOutput,
      costTotalMicrocents: t.costTotalMicrocents,
      sessionId: t.sessionId,
      userId: t.userId,
      systemInstructions: t.systemInstructions,
      allMessages: t.allMessages,
      // User-defined metadata captured at instrumentation time.
      // Carries prompt template variables so golden datasets can be re-run
      // through templated prompts without re-deriving inputs from messages.
      traceMetadata: t.metadata,
    } as Record<string, unknown>,
  }
}

const PAGE_SIZE = 1_000
const ISSUE_TRACE_PAGE_SIZE = 1_000

function collectAllProjectTraceIds(args: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly searchQuery?: string
  readonly filters?: FilterSet
}) {
  return Effect.gen(function* () {
    const repo = yield* TraceRepository
    const ids: TraceId[] = []
    let cursor: TraceListCursor | undefined

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = yield* repo.listByProjectId({
        organizationId: args.organizationId,
        projectId: args.projectId,
        options: {
          limit: PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
          ...(args.searchQuery ? { searchQuery: args.searchQuery } : {}),
          ...(args.filters ? { filters: args.filters } : {}),
        },
      })
      for (const trace of page.items) {
        ids.push(trace.traceId)
      }
      if (!page.hasMore || !page.nextCursor) break
      cursor = page.nextCursor
    }

    return ids
  })
}

function collectAllIssueTraceIds(args: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly issueId: IssueId
}) {
  return Effect.gen(function* () {
    const repo = yield* ScoreAnalyticsRepository
    const ids: TraceId[] = []
    let offset = 0

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = yield* repo.listTracesByIssue({
        organizationId: args.organizationId,
        projectId: args.projectId,
        issueId: args.issueId,
        limit: ISSUE_TRACE_PAGE_SIZE,
        offset,
      })
      for (const item of page.items) {
        ids.push(item.traceId)
      }
      if (!page.hasMore) break
      offset += page.limit
    }

    return ids
  })
}

function collectAllTraceIds(args: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly source: TraceSource
  readonly searchQuery?: string
  readonly filters?: FilterSet
}) {
  if (args.source.kind === "issue") {
    return collectAllIssueTraceIds({
      organizationId: args.organizationId,
      projectId: args.projectId,
      issueId: args.source.issueId,
    })
  }
  return collectAllProjectTraceIds({
    organizationId: args.organizationId,
    projectId: args.projectId,
    ...(args.searchQuery ? { searchQuery: args.searchQuery } : {}),
    ...(args.filters ? { filters: args.filters } : {}),
  })
}

function resolveTraceIds(args: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly source: TraceSource
  readonly selection: TraceSelection
  readonly searchQuery?: string
  readonly filters?: FilterSet
}) {
  return Effect.gen(function* () {
    if (args.selection.mode === "selected") return args.selection.traceIds

    const allIds = yield* collectAllTraceIds({
      organizationId: args.organizationId,
      projectId: args.projectId,
      source: args.source,
      ...(args.searchQuery ? { searchQuery: args.searchQuery } : {}),
      ...(args.filters ? { filters: args.filters } : {}),
    })

    if (args.selection.mode === "all") return allIds

    const excluded = new Set<string>(args.selection.traceIds as readonly string[])
    return allIds.filter((id) => !excluded.has(id as string))
  })
}

function fetchTraces(args: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceIds: readonly TraceId[]
}) {
  return Effect.gen(function* () {
    const repo = yield* TraceRepository
    return yield* repo.listByTraceIds(args)
  })
}

const EMPTY_RESULT = { versionId: "" as const, version: 0, rowIds: [] as string[] }

export const addTracesToDataset = Effect.fn("datasets.addTracesToDataset")(function* (args: {
  readonly projectId: ProjectId
  readonly datasetId: DatasetId
  readonly source: TraceSource
  readonly selection: TraceSelection
  readonly searchQuery?: string
  readonly filters?: FilterSet
}) {
  yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)
  yield* Effect.annotateCurrentSpan("projectId", args.projectId)

  const chSqlClient = yield* ChSqlClient
  const rowRepo = yield* DatasetRowRepository

  const traceIds = yield* resolveTraceIds({
    organizationId: chSqlClient.organizationId,
    projectId: args.projectId,
    source: args.source,
    selection: args.selection,
    ...(args.searchQuery ? { searchQuery: args.searchQuery } : {}),
    ...(args.filters ? { filters: args.filters } : {}),
  })
  if (traceIds.length === 0) return EMPTY_RESULT
  if (traceIds.length > MAX_TRACES_PER_DATASET_IMPORT) {
    return yield* new TooManyTracesError({ count: traceIds.length, limit: MAX_TRACES_PER_DATASET_IMPORT })
  }

  const existingTraceIds = yield* rowRepo.findExistingTraceIds({
    datasetId: args.datasetId,
    traceIds,
  })

  const newTraceIds = traceIds.filter((id) => !existingTraceIds.has(id))
  if (newTraceIds.length === 0) return EMPTY_RESULT

  const traces = yield* fetchTraces({
    organizationId: chSqlClient.organizationId,
    projectId: args.projectId,
    traceIds: newTraceIds,
  })
  const rows = traces.map(mapTraceToRow)
  if (rows.length === 0) return EMPTY_RESULT

  return yield* insertRows({
    datasetId: args.datasetId,
    rows,
    source: "traces",
  })
})

export const createDatasetFromTraces = Effect.fn("datasets.createDatasetFromTraces")(function* (args: {
  readonly projectId: ProjectId
  readonly name: string
  readonly source: TraceSource
  readonly selection: TraceSelection
  readonly searchQuery?: string
  readonly filters?: FilterSet
}) {
  yield* Effect.annotateCurrentSpan("projectId", args.projectId)

  const chSqlClient = yield* ChSqlClient
  const datasetRepo = yield* DatasetRepository

  const dataset = yield* createDataset({
    projectId: args.projectId,
    name: args.name,
  })

  const populateDataset = Effect.gen(function* () {
    const traceIds = yield* resolveTraceIds({
      organizationId: chSqlClient.organizationId,
      projectId: args.projectId,
      source: args.source,
      selection: args.selection,
      ...(args.searchQuery ? { searchQuery: args.searchQuery } : {}),
      ...(args.filters ? { filters: args.filters } : {}),
    })
    if (traceIds.length === 0) {
      return { datasetId: dataset.id, ...EMPTY_RESULT }
    }
    if (traceIds.length > MAX_TRACES_PER_DATASET_IMPORT) {
      return yield* new TooManyTracesError({ count: traceIds.length, limit: MAX_TRACES_PER_DATASET_IMPORT })
    }

    const traces = yield* fetchTraces({
      organizationId: chSqlClient.organizationId,
      projectId: args.projectId,
      traceIds,
    })
    const rows = traces.map(mapTraceToRow)
    if (rows.length === 0) {
      return { datasetId: dataset.id, ...EMPTY_RESULT }
    }

    const result = yield* insertRows({
      datasetId: dataset.id,
      rows,
      source: "traces",
    })

    return { datasetId: dataset.id, ...result }
  })

  return yield* populateDataset.pipe(Effect.tapError(() => datasetRepo.softDelete(dataset.id)))
})
