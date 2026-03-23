import type { DatasetId, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { ChSqlClient } from "@domain/shared"
import type { TraceDetail, TraceListCursor } from "@domain/spans"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { MAX_TRACES_PER_DATASET_IMPORT } from "../constants.ts"
import { TooManyTracesError } from "../entities/dataset.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository } from "../ports/dataset-row-repository.ts"
import { createDataset } from "./create-dataset.ts"
import { insertRows } from "./insert-rows.ts"

export type TraceSelection =
  | { readonly mode: "selected"; readonly traceIds: readonly TraceId[] }
  | { readonly mode: "all" }
  | { readonly mode: "allExcept"; readonly traceIds: readonly TraceId[] }

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
    } as Record<string, unknown>,
  }
}

const PAGE_SIZE = 1_000

function collectAllTraceIds(args: { readonly organizationId: OrganizationId; readonly projectId: ProjectId }) {
  return Effect.gen(function* () {
    const repo = yield* TraceRepository
    const ids: TraceId[] = []
    let cursor: TraceListCursor | undefined

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = yield* repo.findByProjectId({
        organizationId: args.organizationId,
        projectId: args.projectId,
        options: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
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

function resolveTraceIds(args: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly selection: TraceSelection
}) {
  return Effect.gen(function* () {
    if (args.selection.mode === "selected") return args.selection.traceIds

    const allIds = yield* collectAllTraceIds({
      organizationId: args.organizationId,
      projectId: args.projectId,
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
    return yield* repo.findByTraceIds(args)
  })
}

const EMPTY_RESULT = { versionId: "" as const, version: 0, rowIds: [] as string[] }

export function addTracesToDataset(args: {
  readonly projectId: ProjectId
  readonly datasetId: DatasetId
  readonly selection: TraceSelection
}) {
  return Effect.gen(function* () {
    const chSqlClient = yield* ChSqlClient
    const rowRepo = yield* DatasetRowRepository

    const traceIds = yield* resolveTraceIds({
      organizationId: chSqlClient.organizationId,
      projectId: args.projectId,
      selection: args.selection,
    })
    if (traceIds.length === 0) return EMPTY_RESULT
    if (traceIds.length > MAX_TRACES_PER_DATASET_IMPORT) {
      yield* new TooManyTracesError({ count: traceIds.length, limit: MAX_TRACES_PER_DATASET_IMPORT })
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
}

export function createDatasetFromTraces(args: {
  readonly projectId: ProjectId
  readonly name: string
  readonly selection: TraceSelection
}) {
  return Effect.gen(function* () {
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
        selection: args.selection,
      })
      if (traceIds.length === 0) {
        return { datasetId: dataset.id, ...EMPTY_RESULT }
      }
      if (traceIds.length > MAX_TRACES_PER_DATASET_IMPORT) {
        yield* new TooManyTracesError({ count: traceIds.length, limit: MAX_TRACES_PER_DATASET_IMPORT })
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
}
