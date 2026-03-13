import type { DatasetId, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import type { TraceDetail } from "@domain/spans"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository } from "../ports/dataset-row-repository.ts"
import { createDataset } from "./create-dataset.ts"
import { insertRows } from "./insert-rows.ts"

// TODO: include sessionId and userId in metadata once they are available on the traces MV
function mapTraceToRow(t: TraceDetail) {
  return {
    input: t.inputMessages as unknown as Record<string, unknown>,
    output: t.outputMessages as unknown as Record<string, unknown>,
    metadata: {
      traceId: t.traceId,
      rootSpanName: t.rootSpanName,
      models: t.models,
      status: t.status,
      durationNs: t.durationNs,
      tokensInput: t.tokensInput,
      tokensOutput: t.tokensOutput,
      costTotalMicrocents: t.costTotalMicrocents,
    } as Record<string, unknown>,
  }
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

export function addTracesToDataset(args: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly datasetId: DatasetId
  readonly traceIds: readonly TraceId[]
}) {
  return Effect.gen(function* () {
    const rowRepo = yield* DatasetRowRepository

    const existingTraceIds = yield* rowRepo.findExistingTraceIds({
      organizationId: args.organizationId,
      datasetId: args.datasetId,
      traceIds: args.traceIds,
    })

    const newTraceIds = args.traceIds.filter((id) => !existingTraceIds.has(id))
    if (newTraceIds.length === 0) return { versionId: "" as const, version: 0, rowIds: [] as string[] }

    const traces = yield* fetchTraces({ ...args, traceIds: newTraceIds })
    const rows = traces.map(mapTraceToRow)
    if (rows.length === 0) return { versionId: "" as const, version: 0, rowIds: [] as string[] }

    return yield* insertRows({
      organizationId: args.organizationId,
      datasetId: args.datasetId,
      rows,
      source: "traces",
    })
  })
}

export function createDatasetFromTraces(args: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly name: string
  readonly traceIds: readonly TraceId[]
}) {
  return Effect.gen(function* () {
    const datasetRepo = yield* DatasetRepository

    const dataset = yield* createDataset({
      organizationId: args.organizationId,
      projectId: args.projectId,
      name: args.name,
    })

    const populateDataset = Effect.gen(function* () {
      const traces = yield* fetchTraces(args)
      const rows = traces.map(mapTraceToRow)
      if (rows.length === 0) {
        return { datasetId: dataset.id, versionId: "" as const, version: 0, rowIds: [] as string[] }
      }

      const result = yield* insertRows({
        organizationId: args.organizationId,
        datasetId: dataset.id,
        rows,
        source: "traces",
      })

      return { datasetId: dataset.id, ...result }
    })

    return yield* populateDataset.pipe(Effect.tapError(() => datasetRepo.softDelete(dataset.id)))
  })
}
