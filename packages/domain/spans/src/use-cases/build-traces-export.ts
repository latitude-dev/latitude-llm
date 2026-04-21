import { buildTracesExportFilename, type ExportSelection } from "@domain/exports"
import { type FilterSet, type OrganizationId, type ProjectId, TraceId } from "@domain/shared"
import { Effect, Schema } from "effect"
import type { Trace } from "../entities/trace.ts"
import { TraceRepository } from "../ports/trace-repository.ts"

const BATCH_SIZE = 1000
const traceMetadataFromJsonStringSchema = Schema.fromJsonString(Schema.Record(Schema.String, Schema.String))

export interface BuildTracesExportInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly filters?: FilterSet
  readonly selection?: ExportSelection
}

export interface BuildTracesExportResult {
  readonly csv: string
  readonly filename: string
  readonly exportName: string
}

const traceToCsvRow = (trace: Trace): string[] => [
  trace.traceId,
  String(trace.spanCount),
  String(trace.errorCount),
  trace.startTime.toISOString(),
  trace.endTime.toISOString(),
  String(trace.durationNs),
  String(trace.timeToFirstTokenNs),
  String(trace.tokensInput),
  String(trace.tokensOutput),
  String(trace.tokensCacheRead),
  String(trace.tokensCacheCreate),
  String(trace.tokensReasoning),
  String(trace.tokensTotal),
  String(trace.costInputMicrocents),
  String(trace.costOutputMicrocents),
  String(trace.costTotalMicrocents),
  trace.sessionId,
  trace.userId,
  trace.simulationId || "",
  trace.tags.join("|"),
  Schema.encodeSync(traceMetadataFromJsonStringSchema)(trace.metadata),
  trace.models.join("|"),
  trace.providers.join("|"),
  trace.serviceNames.join("|"),
  trace.rootSpanId,
  trace.rootSpanName,
]

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

export const buildTracesExportUseCase = Effect.fn("spans.buildTracesExport")(function* (input: BuildTracesExportInput) {
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)

  const traceRepo = yield* TraceRepository
  const csvRows: string[][] = [
    [
      "traceId",
      "spanCount",
      "errorCount",
      "startTime",
      "endTime",
      "durationNs",
      "timeToFirstTokenNs",
      "tokensInput",
      "tokensOutput",
      "tokensCacheRead",
      "tokensCacheCreate",
      "tokensReasoning",
      "tokensTotal",
      "costInputMicrocents",
      "costOutputMicrocents",
      "costTotalMicrocents",
      "sessionId",
      "userId",
      "simulationId",
      "tags",
      "metadata",
      "models",
      "providers",
      "serviceNames",
      "rootSpanId",
      "rootSpanName",
    ],
  ]

  const appendTraces = (traces: readonly Trace[]) => {
    for (const trace of traces) {
      csvRows.push(traceToCsvRow(trace))
    }
  }

  if (input.selection?.mode === "selected") {
    const selectedTraceIds = input.selection.rowIds.map((traceId) => TraceId(traceId))
    const traces = yield* traceRepo.listByTraceIds({
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceIds: selectedTraceIds,
    })
    const tracesById = new Map(traces.map((trace) => [trace.traceId, trace] as const))

    for (const traceId of selectedTraceIds) {
      const trace = tracesById.get(traceId)
      if (!trace) continue

      if (input.filters) {
        const matches = yield* traceRepo.matchesFiltersByTraceId({
          organizationId: input.organizationId,
          projectId: input.projectId,
          traceId,
          filters: input.filters,
        })

        if (!matches) continue
      }

      appendTraces([trace])
    }
  } else {
    const excludedTraceIds =
      input.selection?.mode === "allExcept" ? new Set(input.selection.rowIds.map((traceId) => TraceId(traceId))) : null

    let cursor: { sortValue: string; traceId: string } | undefined
    while (true) {
      const page = yield* traceRepo.listByProjectId({
        organizationId: input.organizationId,
        projectId: input.projectId,
        options: {
          limit: BATCH_SIZE,
          ...(cursor ? { cursor } : {}),
          ...(input.filters ? { filters: input.filters } : {}),
          sortBy: "startTime",
          sortDirection: "desc",
        },
      })

      if (page.items.length === 0) break

      appendTraces(excludedTraceIds ? page.items.filter((trace) => !excludedTraceIds.has(trace.traceId)) : page.items)

      if (!page.hasMore || !page.nextCursor) break
      cursor = page.nextCursor
    }
  }

  return {
    csv: csvRows.map((row) => row.map(escapeCsvField).join(",")).join("\n"),
    filename: buildTracesExportFilename("project_traces"),
    exportName: "Project Traces",
  } satisfies BuildTracesExportResult
})
